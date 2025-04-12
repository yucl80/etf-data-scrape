const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { writeHTML, calculateSizeChanges } = require('./display.js');

// Read configuration
function readConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.error('Error reading config file:', error);
        return { stocks: [] };
    }
}

// Process all stocks from config
async function processAllStocks() {
    const config = readConfig();
    const results = [];

    for (const stock of config.stocks) {
        try {
            if (!shouldScrapeStock(stock)) {
                console.log(`Skipping ${stock} - already scraped today`);
                continue;
            }

            let result;
            if (stock.startsWith('1')) {
                result = await szScrapeData(stock);
            } else if (stock.startsWith('5')) {
                result = await shScrapeData(stock);
            } else {
                console.log(`Skipping stock ${stock} - unknown prefix`);
                continue;
            }

            if (result) {
                results.push(result);
                // Calculate and display size changes for each stock
                const changes = calculateSizeChanges(stock);
                if (changes) {
                    console.log(`\nSize Changes for ${stock}:`);
                    console.log('1-Day Change:', changes.oneDayChange);
                    if (changes.threeDayChange) {
                        console.log('3-Day Change:', changes.threeDayChange);
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing stock ${stock}:`, error);
        }
    }

    return results;
}

async function shScrapeData(fundId) {
    // 启动浏览器
    const browser = await puppeteer.launch({
        headless: 'new' // 使用无头模式
    });

    try {
        // 创建新页面
        const page = await browser.newPage();
        
        // 设置视口大小
        await page.setViewport({ width: 1280, height: 800 });
        
        // 访问目标网站
        await page.goto('https://www.sse.com.cn/assortment/fund/list/tcurrencyfundinfo/basic/index.shtml?FUNDID='+fundId, {
            waitUntil: 'networkidle0' // 等待网络请求完成
        });

        // 等待包含多个class的元素加载
        await page.waitForSelector('.product_detailBox.js_fundSize');

        // 获取表格数据
        const tableData = await page.evaluate(() => {
            // 使用多个class组合选择器
            const container = document.querySelector('.product_detailBox.js_fundSize');
            if (!container) return null;

            // 在容器内查找表格
            const table = container.querySelector('table');
            if (!table) return null;

            const rows = Array.from(table.querySelectorAll('tr'));
            return rows.map(row => {
                const cells = Array.from(row.querySelectorAll('td, th'));
                return cells.map(cell => cell.textContent.trim());
            });
        });

        if (tableData && tableData.length > 1) {    
            const stock = tableData[1][1];    
            const result = {
                date: tableData[1][0],
                stock: tableData[1][1],
                name: tableData[1][2],
                size: tableData[1][3],                
            };            
            // Save the result to file
            await saveToFile(stock,result);
            return result;
        } else {
            console.log('未找到表格数据或数据不足');
            return null;
        }

    } catch (error) {
        console.error('发生错误:', error);
        return null
    } finally {
        // 关闭浏览器
        await browser.close();
    }
}

async function saveToFile(stock,data) {
    const fileName = 'data/'+stock+'_data.json';
    let existingData = [];
    
    try {
        // Create data directory if it doesn't exist
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data');
        }

        if (fs.existsSync(fileName)) {
            const fileContent = fs.readFileSync(fileName, 'utf8');
            existingData = JSON.parse(fileContent);
        }
        
        data.scrapeTime = new Date().toISOString();
        // Check if an entry with the same date already exists
        const existingIndex = existingData.findIndex(item => item.date === data.date);
        
        if (existingIndex !== -1) {
            // Update the existing entry
            existingData[existingIndex] = data;
        } else {
            // Add new data to the beginning of the array
            existingData.unshift(data);
        }
        
        // Keep only the 20 most recent entries
        if (existingData.length > 20) {
            existingData = existingData.slice(0, 20);
        }
        
        // Write the updated data back to the file
        fs.writeFileSync(fileName, JSON.stringify(existingData, null, 2));
       
    } catch (error) {
        console.error('Error saving data to file:', error);
    }

    data.scrapeTime = new Date().toISOString();
}

async function szScrapeData(fundId) {
    const browser = await puppeteer.launch({
        headless: 'new'
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        await page.setRequestInterception(true);
        page.on('request', request => {
            request.continue();
        });

        const responsePromise = page.waitForResponse(response => 
            response.status() === 200
        );

        await page.goto(`https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1945&txtQueryKeyAndJC=${fundId}`, {
            waitUntil: 'networkidle0'
        });

        const response = await responsePromise;
        const jsonData = await response.json();

        if (jsonData && jsonData.length > 0) {
            const data = jsonData[0];
            if (data.data) {
                const kzjcurl = data.data[0]["kzjcurl"];
                const hrefRegex = /href=['"]([^'"]+)['"]/g;
                let match = hrefRegex.exec(kzjcurl);
                const href = match[1];              
                const urlobj = new URL(href);
                const params = new URLSearchParams(urlobj.search);
                const dateTxt = data["metadata"]["cols"]["dqgm"]
                const dateRegex = /(\d{4}-\d{2}-\d{2})/;
                const dateMatch = dateTxt.match(dateRegex);
                const date = dateMatch[1];
                const stock= params.get("stock");
                const dqgm = data.data[0]["dqgm"];                
                const result = {
                    date: date,
                    stock: stock,
                    name: params.get("name"),
                    size: dqgm.replace(/[^\d.-]/g, '')                  
                };
                
                // Save the result to file
                await saveToFile(stock,result);
                return result;
            }
        }
        return null;

    } catch (error) {
        console.error('发生错误:', error);
        return null;
    } finally {
        await browser.close();
    }
}

function displayAllStockChanges() {
    const config = readConfig();
    const results = [];

    for (const stock of config.stocks) {
        // Read the stock data file to get the name and latest size
        const fileName = 'data/'+stock+'_data.json';
        let name = 'N/A';
        let latestSize = 'N/A';
        try {
            if (fs.existsSync(fileName)) {
                const fileContent = fs.readFileSync(fileName, 'utf8');
                const data = JSON.parse(fileContent);
                if (data && data.length > 0) {
                    name = data[0].name;
                    latestSize = data[0].size;
                }
            }
        } catch (error) {
            console.error(`Error reading data for stock ${stock}:`, error);
        }

        const changes = calculateSizeChanges(stock);
        results.push({
            stock,
            name,
            latestSize: latestSize === 'N/A' ? 'N/A' : parseFloat(latestSize).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
            oneDayChange: changes?.oneDayChange?.change ?? 'N/A',
            threeDayChange: changes?.threeDayChange?.change ?? 'N/A',
            fiveDayChange: changes?.FiveDayChange?.change ?? 'N/A'
        });
    }

    // Display the table
    console.log('\nStock Size Changes Summary:');
    const separator = '-'.repeat(120);
    console.log(separator);
    
    // Header with fixed width columns
    console.log(
        'Stock'.padEnd(10) + 
        'Name'.padEnd(50) + 
        'Size'.padStart(15) + 
        '1-Day'.padStart(15) + 
        '3-Day'.padStart(15) + 
        '5-Day'.padStart(15)
    );
    
    console.log(separator);
    
    // Data rows with fixed width columns
    results.forEach(result => {
        const formattedSize = result.latestSize === 'N/A' ? 'N/A' : result.latestSize;
        const formattedOneDay = result.oneDayChange === 'N/A' ? 'N/A' : result.oneDayChange.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const formattedThreeDay = result.threeDayChange === 'N/A' ? 'N/A' : result.threeDayChange.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const formattedFiveDay = result.fiveDayChange === 'N/A' ? 'N/A' : result.fiveDayChange.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

        console.log(
            result.stock.padEnd(10) +
            result.name.padEnd(25) +
            formattedSize.padStart(15) +
            formattedOneDay.padStart(15) +
            formattedThreeDay.padStart(15) +
            formattedFiveDay.padStart(15)
        );
    });
    
    console.log(separator);
}

function shouldScrapeStock(stock) {
    const fileName = 'data/'+stock+'_data.json';
    try {
        if (!fs.existsSync(fileName)) {
            return true; // 如果文件不存在，需要抓取
        }

        const fileContent = fs.readFileSync(fileName, 'utf8');
        const data = JSON.parse(fileContent);
        
        if (!data || data.length === 0) {
            return true; // 如果没有数据，需要抓取
        }

        // 获取最新数据的抓取时间
        const latestScrapeTime = new Date(data[0].scrapeTime);
        const now = new Date();
        
        // 如果最新抓取时间不是今天的，需要抓取
        return latestScrapeTime.toDateString() !== now.toDateString();
    } catch (error) {
        console.error(`Error checking scrape status for stock ${stock}:`, error);
        return true; // 如果出错，默认需要抓取
    }
}

// Replace the direct function calls at the bottom with:
(async () => {
    await processAllStocks();
    writeHTML();
})(); 