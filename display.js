const fs = require('fs');
const path = require('path');
const opn = require('opn');
const ETFPEDPFetcher = require('./etf-pe-dp-fetcher.js');
const ETFFundamentalsBatchProcessor = require('./etf-fundamentals-batch.js');
const { processAllETFs, getETFResultByStock } = require('./sp-pdf-metrics.js');

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
        if (item.stock && !item.error) {
            spPdfMap.set(item.stock, item);
        }
    });

    // 首先执行etf-fundamentals-batch
    console.log('🚀 开始执行ETF基本面数据批量处理...');
    const batchProcessor = new ETFFundamentalsBatchProcessor();
    let batchResults = [];
    
    try {
        batchResults = await batchProcessor.processAllETFs();
        console.log(`✅ ETF基本面数据批量处理完成，共获取 ${batchResults.length} 个ETF的数据`);
    } catch (error) {
        console.error('❌ ETF基本面数据批量处理失败:', error);
        console.log('⚠️ 将使用原有的单个ETF获取逻辑');
    }
    
    // 将批量结果转换为Map以便快速查找
    const batchResultsMap = new Map();
    batchResults.forEach(result => {
        if (result.etfCode && !result.error) {
            batchResultsMap.set(result.etfCode, {
                indexName: result.indexName,
                peValue: result.peRatio,
                dpValue: result.dividendYield
            });
        }
    });

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

        // 优先使用S&P PDF指标数据
        if (spPdfMap.has(stock)) {
            const spData = spPdfMap.get(stock);
            indexName = spData.indexName || '-';
            peValue = spData["预期市盈率"] !== null && spData["预期市盈率"] !== undefined ? spData["预期市盈率"] : '-';
            dpValue = spData["股息率"] !== null && spData["股息率"] !== undefined ? spData["股息率"] : '-';
            console.log(`📊 从S&P PDF数据中获取 ${stock} 的数据: PE=${peValue}, DP=${dpValue}`);
        } else if (batchResultsMap.has(stock)) {
            // 其次使用批量处理结果
            const batchData = batchResultsMap.get(stock);
            indexName = batchData.indexName || '-';
            peValue = batchData.peValue !== null && batchData.peValue !== undefined ? batchData.peValue : '-';
            dpValue = batchData.dpValue !== null && batchData.dpValue !== undefined ? batchData.dpValue : '-';
            console.log(`📊 从批量数据中获取 ${stock} 的数据: PE=${peValue}, DP=${dpValue}`);
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
            peValue,
            dpValue,
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
    
    return {
        tableHtml: html,
        updateTime: updateTime
    };
}

// Write the HTML content to a file
async function writeHTML() {
    const { tableHtml, updateTime } = await generateHTML();
    
    // Read the template HTML
    const templatePath = path.join(__dirname, 'index.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');
    
    // Replace the placeholder with actual data
    htmlContent = htmlContent.replace('<!-- Data will be inserted here by JavaScript -->', tableHtml);
    htmlContent = htmlContent.replace('<span id="updateTime"></span>', updateTime);
    
    // Write the updated HTML to a new file
    const outputPath = path.join(process.cwd(), 'output.html');
    fs.writeFileSync(outputPath, htmlContent);
    
    console.log('HTML file has been generated successfully!');
    
    // Open the file in the default browser
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