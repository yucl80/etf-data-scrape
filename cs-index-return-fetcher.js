const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = 'index-return';
const EXCEL_FILE_PATH = '指数列表.xlsx';
const BASE_URL = 'https://www.csindex.com.cn/#/indices/family/detail?indexCode=';

// 存储所有指数数据的数组
let allIndexData = [];

// 生成随机延时函数
function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function fetchIndexReturnData(browser, indexCode) {
    const page = await browser.newPage();
    try {
        console.log(`Fetching data for index: ${indexCode}`);
        
        // Set a longer timeout and wait for network to be idle
        await page.goto(`${BASE_URL}${indexCode}`, { 
            waitUntil: 'networkidle0',
            timeout: 60000 
        });

        // 随机延时 3-7 秒，模拟页面加载时间
        const loadDelay = getRandomDelay(3000, 7000);
        console.log(`Waiting ${loadDelay}ms for page load...`);
        await page.waitForTimeout(loadDelay);

        // Wait for the "五年" button and click it
        const fiveYearButtonXPath = "//span[contains(@class, 'tag-name') and contains(., '五年')]";
        try {
            await page.waitForXPath(fiveYearButtonXPath, { timeout: 15000 });
            const [fiveYearButton] = await page.$x(fiveYearButtonXPath);

            if (fiveYearButton) {
                // 随机延时 1-3 秒，模拟人工点击前的思考时间
                const clickDelay = getRandomDelay(1000, 3000);
                console.log(`Waiting ${clickDelay}ms before clicking...`);
                await page.waitForTimeout(clickDelay);
                
                await fiveYearButton.click();
                console.log(`Clicked "五年" button for index ${indexCode}`);
                
                // 随机延时 2-5 秒，等待数据更新
                const updateDelay = getRandomDelay(2000, 5000);
                console.log(`Waiting ${updateDelay}ms for data update...`);
                await page.waitForTimeout(updateDelay);
            } else {
                console.warn(`Could not find "五年" button for index ${indexCode}. Proceeding with default view.`);
            }
        } catch (buttonError) {
            console.warn(`Could not find or click "五年" button for index ${indexCode}:`, buttonError.message);
        }
        
        // Wait for the table wrapper to be present
        try {
            await page.waitForSelector('.mt24.ivu-table-wrapper', { 
                visible: true, 
                timeout: 30000 
            });
        } catch (tableError) {
            console.warn(`Could not find table wrapper for index ${indexCode}:`, tableError.message);
            // Try alternative selector
            await page.waitForSelector('.ivu-table-wrapper', { 
                visible: true, 
                timeout: 30000 
            });
        }
        
        const data = await page.evaluate(() => {
            // Try multiple selectors to find the table
            let tableWrapper = document.querySelector('.mt24.ivu-table-wrapper');
            if (!tableWrapper) {
                tableWrapper = document.querySelector('.ivu-table-wrapper');
            }
            if (!tableWrapper) {
                console.log('No table wrapper found');
                return [];
            }
            
            const rows = Array.from(tableWrapper.querySelectorAll('.ivu-table-tbody tr'));
            console.log(`Found ${rows.length} rows in table`);
            
            const rowData = rows.map((row, index) => {
                const columns = row.querySelectorAll('td');
                console.log(`Row ${index}: ${columns.length} columns`);
                console.log(`Row ${index} content:`, Array.from(columns).map(col => col.innerText.trim()));
                
                if (columns.length < 9) return null;
                
                // 第一列通常是代码，第二列是名称，后面9列是数据
                return {
                    name: columns[0].innerText.trim(),
                    // 阶段性收益 (前3列)
                    阶段性收益_近一月: columns[1].innerText.trim(),
                    阶段性收益_近三月: columns[2].innerText.trim(),
                    阶段性收益_年至今: columns[3].innerText.trim(),
                    // 年化收益 (中间3列)
                    年化收益_近一年: columns[4].innerText.trim(),
                    年化收益_近三年: columns[5].innerText.trim(),
                    年化收益_近五年: columns[6].innerText.trim(),
                    // 年化波动率 (后3列)
                    年化波动率_近一年: columns[7].innerText.trim(),
                    年化波动率_近三年: columns[8] ? columns[8].innerText.trim() : '',
                    年化波动率_近五年: columns[9] ? columns[9].innerText.trim() : ''
                };
            }).filter(Boolean);
            return rowData;
        });

        // 将数据添加到全局数组中
        if (data.length > 0) {
            const indexData = {
                indexCode: indexCode,
                data: data
            };
            allIndexData.push(indexData);
            console.log(`Data collected for ${indexCode} with ${data.length} rows`);
        } else {
            console.warn(`No data found for index ${indexCode} in the table.`);
        }

    } catch (error) {
        console.error(`Failed to fetch data for index ${indexCode}:`, error.message);
    } finally {
        await page.close();
    }
}

async function main() {
    const browser = await puppeteer.launch({ headless: true }); // Set to false to watch execution
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        const workbook = xlsx.readFile(EXCEL_FILE_PATH);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        const indexCodes = rows.slice(1).map(row => String(row[0])).filter(code => code && code.trim() !== '');

        for (let i = 0; i < indexCodes.length; i++) {
            const code = indexCodes[i];
            await fetchIndexReturnData(browser, code);
            
            // 在指数之间添加随机延时 5-15 秒，模拟人工操作间隔
            if (i < indexCodes.length - 1) {
                const betweenDelay = getRandomDelay(5000, 15000);
                console.log(`Waiting ${betweenDelay}ms before processing next index...`);
                await new Promise(resolve => setTimeout(resolve, betweenDelay));
            }
        }

        // 保存所有数据到一个JSON文件
        const today = new Date().toISOString().split('T')[0]; // 格式: YYYY-MM-DD
        const outputFilePath = path.join(DATA_DIR, `all_index_returns_${today}.json`);
        await fs.writeFile(outputFilePath, JSON.stringify(allIndexData, null, 2), 'utf-8');
        console.log(`All data saved to ${outputFilePath} with ${allIndexData.length} indices`);
        
        // 同时保存一个不带日期的文件作为默认文件
        const defaultOutputFilePath = path.join(DATA_DIR, 'all_index_returns.json');
        await fs.writeFile(defaultOutputFilePath, JSON.stringify(allIndexData, null, 2), 'utf-8');
        console.log(`Default data file also saved to ${defaultOutputFilePath}`);

    } catch (error) {
        console.error('An error occurred during the main process:', error);
    } finally {
        await browser.close();
        console.log('All tasks finished. Browser closed.');
    }
}

main(); 