const fs = require('fs');
const path = require('path');
const opn = require('opn');
const ETFPEDPFetcher = require('./etf-pe-dp-fetcher.js');
const { processAllETFs, getETFResultByStock } = require('./sp-pdf-metrics.js');
const HSIIndexScraper = require('./hsi-index-scraper.js');

function readConfig() {
    try {
        const configPath = path.join(process.cwd(), 'config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.error('Error reading config file:', error);
        return { stocks: [] };
    }
}

function calculateSizeChanges(stock) {
    const fileName = 'data/'+stock+'_data.json';
    try {
        if (!fs.existsSync(fileName)) {
            console.log('No data file found');
            return null;
        }

        const fileContent = fs.readFileSync(fileName, 'utf8');
        const data = JSON.parse(fileContent);

        if (!Array.isArray(data) || data.length < 2) {            
            return null;
        }

        const sortedData = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));
               
        const oneDayChange = {
            date: sortedData[0].date,
            change: parseFloat(sortedData[0].size) - parseFloat(sortedData[1].size)
        };

        let threeDayChange = null;
        if (data.length >= 4) {
            threeDayChange = {
                date: sortedData[0].date,
                change: parseFloat(sortedData[0].size) - parseFloat(sortedData[3].size)
            };
        }

        let FiveDayChange = null;
        if (data.length >= 6) {
            FiveDayChange = {
                date: sortedData[0].date,
                change: parseFloat(sortedData[0].size) - parseFloat(sortedData[5].size)
            };
        }

        let TenDayChange = null;
        if (data.length >= 11) {
            TenDayChange = {
                date: sortedData[0].date,
                change: parseFloat(sortedData[0].size) - parseFloat(sortedData[10].size)
            };
        }

        let FityDayChange = null;
        if (data.length >= 22) {
            FityDayChange = {
                date: sortedData[0].date,
                change: parseFloat(sortedData[0].size) - parseFloat(sortedData[21].size)
            };
        }

        let ThirtyDayChange = null;
        if (data.length >= 31) {
            ThirtyDayChange = {
                date: sortedData[0].date,
                change: parseFloat(sortedData[0].size) - parseFloat(sortedData[30].size)
            };
        }

        return {
            oneDayChange,
            threeDayChange,
            FiveDayChange,
            TenDayChange,
            ThirtyDayChange
        };
    } catch (error) {
        console.error('Error calculating size changes:', error);
        return null;
    }
}

function formatNumber(num) {
    if (num === 'N/A') return num;
    return (parseFloat(num)/10000).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function getChangeClass(change) {
    if (change === 'N/A') return '';
    return change > 0 ? 'negative' : 'positive';
}

async function generateHTML() {
    const config = readConfig();
    const results = [];
    const fetcher = new ETFPEDPFetcher();
    
    // 先获取S&P PDF指标数据
    let spPdfResults = [];
    try {
        spPdfResults = await processAllETFs();
        console.log(`✅ S&P PDF指标数据获取完成，共获取 ${spPdfResults.length} 个ETF的数据`);
    } catch (error) {
        console.error('❌ S&P PDF指标数据获取失败:', error);
    }
    // 构建Map便于查找
    const spPdfMap = new Map();
    spPdfResults.forEach(item => {
        console.log(item);
        if (item.stock && !item.error) {
            spPdfMap.set(item.stock, item);
        }
    });
    console.log(spPdfMap);
  

    // 读取恒生指数数据（直接调用HSIFundamentalsScraper.getAllHsidata，内部已处理缓存）
    let hsiFundamentalsMap = new Map();
    try {
        const config = readConfig();
        const etfIndexMapping = config.etfIndexMapping || {};
        const hsiScraper = new HSIIndexScraper();
        const hsiData = await hsiScraper.getAllHsidata(etfIndexMapping);
        if (hsiData && Array.isArray(hsiData.results)) {
            hsiData.results.forEach(item => {
                if (item.etfCode && item.fundamentals && item.success) {
                    hsiFundamentalsMap.set(item.etfCode, item);
                }
            });
        }
        await hsiScraper.close && hsiScraper.close();
    } catch (e) {
        console.error('自动获取恒生指数数据失败:', e);
    }

    for (const stock of config.stocks) {
        const fileName = 'data/'+stock+'_data.json';
        let name = 'N/A';
        let latestSize = 'N/A';
        let indexName = '-';
        let peValue = '-';
        let dpValue = '-';
        
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

        // 优先使用恒生指数数据
        if (hsiFundamentalsMap.has(stock)) {
            const hsiData = hsiFundamentalsMap.get(stock);
            indexName = hsiData.indexName || '-';
            peValue = hsiData.fundamentals.peRatio !== null && hsiData.fundamentals.peRatio !== undefined ? hsiData.fundamentals.peRatio : '-';
            dpValue = hsiData.fundamentals.dividendYield !== null && hsiData.fundamentals.dividendYield !== undefined ? hsiData.fundamentals.dividendYield : '-';
            console.log(`📊 从恒生指数数据中获取 ${stock} 的数据: PE=${peValue}, DP=${dpValue}`);
        } else if (spPdfMap.has(stock)) {
            // 其次使用S&P PDF指标数据
            const spData = spPdfMap.get(stock);
            indexName = spData.indexName || '-';
            peValue = spData["预期市盈率"] !== null && spData["预期市盈率"] !== undefined ? spData["预期市盈率"] : '-';
            dpValue = spData["股息率"] !== null && spData["股息率"] !== undefined ? spData["股息率"] : '-';
            console.log(`📊 从S&P PDF数据中获取 ${stock} 的数据: PE=${peValue}, DP=${dpValue}`);
        } else {
            // 如果都没有，使用原有的逻辑
            try {
                const peDpResult = await fetcher.getETFPEAndDP(stock);
                if (peDpResult.success) {
                    indexName = peDpResult.indexName || '-';
                    peValue = peDpResult.peValue !== null && peDpResult.peValue !== undefined ? peDpResult.peValue : '-';
                    dpValue = peDpResult.dpValue !== null && peDpResult.dpValue !== undefined ? peDpResult.dpValue : '-';
                }
            } catch (error) {
                console.error(`Error getting PE/DP data for stock ${stock}:`, error);
            }
        }

        const changes = calculateSizeChanges(stock);
        results.push({
            stock,
            name,
            latestSize: latestSize === 'N/A' ? 'N/A' : parseFloat(latestSize),
            indexName,
            peValue: (peValue !== null && peValue !== undefined && !isNaN(Number(peValue))) ? Number(peValue) : '-',
            dpValue: (dpValue !== null && dpValue !== undefined && !isNaN(Number(dpValue))) ? Number(dpValue) : '-',
            oneDayChange: changes?.oneDayChange?.change ?? 'N/A',
            threeDayChange: changes?.threeDayChange?.change ?? 'N/A',
            fiveDayChange: changes?.FiveDayChange?.change ?? 'N/A',
            tenDayChange: changes?.TenDayChange?.change ?? 'N/A',
            thirtyDayChange: changes?.ThirtyDayChange?.change ?? 'N/A'
        });
    }

    let html = '';
    results.forEach(result => {
        html += `
            <tr>
                <td>${result.stock}</td>
                <td>${result.name}</td>
                <td>${formatNumber(result.latestSize)}</td>
                <td class="${getChangeClass(result.oneDayChange)}">${formatNumber(result.oneDayChange)}</td>
                <td class="${getChangeClass(result.threeDayChange)}">${formatNumber(result.threeDayChange)}</td>
                <td class="${getChangeClass(result.fiveDayChange)}">${formatNumber(result.fiveDayChange)}</td>
                <td class="${getChangeClass(result.tenDayChange)}">${formatNumber(result.tenDayChange)}</td>
                <td class="${getChangeClass(result.thirtyDayChange)}">${formatNumber(result.thirtyDayChange)}</td>
                <td>${result.indexName}</td>
                <td>${result.peValue}</td>
                <td>${result.dpValue}</td>
            </tr>
        `;
    });

    const updateTime = new Date().toLocaleString();
    
    // 新增：将表格数据以JSON形式返回
    return {
        tableHtml: html,
        updateTime: updateTime,
        tableData: JSON.stringify(results)
    };
}

// Write the HTML content to a file
async function writeHTML() {
    // Get today's date string in YYYY-MM-DD format
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Ensure report-data directory exists
    const htmlDataDir = path.join(process.cwd(), 'report-data');
    if (!fs.existsSync(htmlDataDir)) {
        fs.mkdirSync(htmlDataDir);
    }

    // Set output file path
    const outputFileName = `etf-report-${dateStr}.html`;
    const outputPath = path.join(htmlDataDir, outputFileName);

    // If today's file exists, open it and return
    if (fs.existsSync(outputPath)) {
        console.log(`Today's HTML file already exists: ${outputPath}`);
        opn(outputPath);
        return;
    }

    // Otherwise, generate new HTML
    const { tableHtml, updateTime, tableData } = await generateHTML();
    const templatePath = path.join(__dirname, 'etf-report-template.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');
    htmlContent = htmlContent.replace('<!-- Data will be inserted here by JavaScript -->', tableHtml + `\n<script id="tableData" type="application/json">${tableData}</script>`);
    htmlContent = htmlContent.replace('<span id="updateTime"></span>', updateTime);
    fs.writeFileSync(outputPath, htmlContent);
    console.log('HTML file has been generated successfully!');
    opn(outputPath);
}

// Export the functions
module.exports = { writeHTML, calculateSizeChanges }; 

// Main function to run the program
async function main() {
    try {
        await writeHTML();
    } catch (error) {
        console.error('Error generating HTML:', error);
        process.exit(1);
    }
}

// Run the main function if this file is executed directly
if (require.main === module) {
    main();
} 