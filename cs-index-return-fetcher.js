const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = 'index-return';
const EXCEL_FILE_PATH = '指数列表.xlsx';
const BASE_URL = 'https://www.csindex.com.cn/#/indices/family/detail?indexCode=';

// 重试配置
const RETRY_CONFIG = {
    maxRetries: 3,           // 最大重试次数
    baseDelay: 2000,         // 基础延迟时间（毫秒）
    maxDelay: 30000,         // 最大延迟时间（毫秒）
    backoffMultiplier: 2     // 退避倍数
};

// 存储所有指数数据的数组
let allIndexData = [];

// 生成随机延时函数
function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 计算重试延迟时间（指数退避）
function calculateRetryDelay(retryCount) {
    const delay = RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, retryCount);
    return Math.min(delay, RETRY_CONFIG.maxDelay);
}

// 判断是否为可重试的错误
function isRetryableError(error) {
    const retryableErrors = [
        'net::ERR_CONNECTION_TIMED_OUT',
        'net::ERR_NETWORK',
        'net::ERR_INTERNET_DISCONNECTED',
        'net::ERR_CONNECTION_REFUSED',
        'net::ERR_NAME_NOT_RESOLVED',
        'TimeoutError',
        'Navigation timeout',
        'Protocol error',
        'Target closed'
    ];
    
    return retryableErrors.some(errorType => 
        error.message.includes(errorType) || 
        error.name === errorType
    );
}

async function fetchIndexReturnData(browser, indexCode) {
    let retryCount = 0;
    
    while (retryCount <= RETRY_CONFIG.maxRetries) {
        const page = await browser.newPage();
        try {
            console.log(`Fetching data for index: ${indexCode}${retryCount > 0 ? ` (Retry ${retryCount}/${RETRY_CONFIG.maxRetries})` : ''}`);
            
            // Set a longer timeout and wait for network to be idle
            await page.goto(`${BASE_URL}${indexCode}`, { 
                waitUntil: 'networkidle0',
                timeout: 60000 
            });

            // 随机延时 3-7 秒，模拟页面加载时间
            const loadDelay = getRandomDelay(2000, 4000);
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
                    const updateDelay = getRandomDelay(1500, 3000);
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
                function getCellValue(td) {
                    let value = td.innerText.trim();
                    // 检查td下是否有<span class="indices-compare-down-arrow">
                    if (td.querySelector && td.querySelector('span.indices-compare-down-arrow')) {
                        if (!value.startsWith('-')) {
                            value = '-' + value;
                        }
                    }
                    return value;
                }
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
                    return {
                        name: getCellValue(columns[0]),
                        阶段性收益_近一月: getCellValue(columns[1]),
                        阶段性收益_近三月: getCellValue(columns[2]),
                        阶段性收益_年至今: getCellValue(columns[3]),
                        年化收益_近一年: getCellValue(columns[4]),
                        年化收益_近三年: getCellValue(columns[5]),
                        年化收益_近五年: getCellValue(columns[6]),
                        年化波动率_近一年: getCellValue(columns[7]),
                        年化波动率_近三年: columns[8] ? getCellValue(columns[8]) : '',
                        年化波动率_近五年: columns[9] ? getCellValue(columns[9]) : ''
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
                await page.close();
                return; // 成功获取数据，退出重试循环
            } else {
                console.warn(`No data found for index ${indexCode} in the table.`);
                await page.close();
                return; // 没有数据但页面正常加载，不重试
            }

        } catch (error) {
            await page.close();
            console.error(`Failed to fetch data for index ${indexCode}${retryCount > 0 ? ` (Retry ${retryCount}/${RETRY_CONFIG.maxRetries})` : ''}:`, error.message);
            
            // 检查是否为可重试的错误
            if (isRetryableError(error) && retryCount < RETRY_CONFIG.maxRetries) {
                retryCount++;
                const retryDelay = calculateRetryDelay(retryCount);
                console.log(`Retrying in ${retryDelay}ms... (Retry ${retryCount}/${RETRY_CONFIG.maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue; // 继续重试
            } else {
                // 不可重试的错误或已达到最大重试次数
                if (retryCount >= RETRY_CONFIG.maxRetries) {
                    console.error(`Max retries (${RETRY_CONFIG.maxRetries}) reached for index ${indexCode}. Giving up.`);
                } else {
                    console.error(`Non-retryable error for index ${indexCode}. Giving up.`);
                }
                return; // 退出重试循环
            }
        }
    }
}

async function fetchAllIndexReturnData() {
    const browser = await puppeteer.launch({ 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }); // Set to false to watch execution
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        const workbook = xlsx.readFile(EXCEL_FILE_PATH);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        const indexCodes = rows.slice(1).map(row => String(row[0])).filter(code => code && code.trim() !== '');

        console.log(`Starting to process ${indexCodes.length} indices with retry mechanism...`);
        console.log(`Retry configuration: Max ${RETRY_CONFIG.maxRetries} retries, Base delay ${RETRY_CONFIG.baseDelay}ms, Max delay ${RETRY_CONFIG.maxDelay}ms`);

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
               

    } catch (error) {
        console.error('An error occurred during the main process:', error);
    } finally {
        await browser.close();
        console.log('All tasks finished. Browser closed.');
    }
}

async function main() {
    await fetchAllIndexReturnData();
}

module.exports = {
    fetchAllIndexReturnData,
    main
};