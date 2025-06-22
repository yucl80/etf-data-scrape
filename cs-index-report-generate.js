const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const open = require('opn');
const CSIndexFetcher = require('./cs-index-fetcher.js');
const { execSync } = require('child_process');

// 检查当天数据文件是否存在，如果不存在则获取数据
function checkAndFetchData() {
    const today = new Date().toISOString().split('T')[0]; // 格式: YYYY-MM-DD
    const dataDir = path.join(__dirname, 'index-data');
    const todayDataFile = path.join(dataDir, `all_index_returns_${today}.json`);
    const defaultDataFile = path.join(dataDir, 'all_index_returns.json');
    
    // 检查当天的数据文件是否存在
    if (fs.existsSync(todayDataFile)) {
        console.log(`找到当天的数据文件: ${todayDataFile}`);
        return todayDataFile;
    }
    
    // 检查默认数据文件是否存在
    if (fs.existsSync(defaultDataFile)) {
        console.log(`找到默认数据文件: ${defaultDataFile}`);
        return defaultDataFile;
    }
    
    // 如果都不存在，则调用数据获取脚本
    console.log('未找到数据文件，开始获取数据...');
    try {
        console.log('执行 cs-index-return-fetcher.js...');
        execSync('node cs-index-return-fetcher.js', { 
            stdio: 'inherit',
            cwd: __dirname 
        });
        
        // 检查获取后的文件是否存在
        if (fs.existsSync(defaultDataFile)) {
            console.log('数据获取成功');
            return defaultDataFile;
        } else {
            console.error('数据获取失败，文件未生成');
            return null;
        }
    } catch (error) {
        console.error('执行数据获取脚本失败:', error.message);
        return null;
    }
}

// 读取JSON数据
function loadJsonData() {
    try {
        // 首先检查并获取数据
        const dataFile = checkAndFetchData();
        if (!dataFile) {
            console.error('无法获取数据文件');
            return [];
        }
        
        const jsonData = fs.readFileSync(dataFile, 'utf8');
        return JSON.parse(jsonData);
    } catch (error) {
        console.error('读取JSON文件失败:', error.message);
        return [];
    }
}

// 读取指数列表Excel文件
function loadIndexList() {
    try {
        const excelPath = path.join(__dirname, '指数列表.xlsx');
        const workbook = XLSX.readFile(excelPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        // 创建指数代码到名称的映射
        const indexMapping = {};
        data.forEach(row => {
            const indexCode = row['指数代码'];
            const indexName = row['指数全称'];
            
            if (indexCode && indexName) {
                indexMapping[indexCode] = indexName;
            }
        });
        
        console.log(`从Excel文件读取到 ${Object.keys(indexMapping).length} 个指数映射`);
        return indexMapping;
    } catch (error) {
        console.error('读取指数列表Excel文件失败:', error.message);
        return {};
    }
}

// 获取PE/DP数据
async function loadPeDpData() {
    try {
        console.log('开始获取PE/DP数据...');
        
        // 创建index-data目录（如果不存在）
        const indexDataDir = path.join(__dirname, 'index-data');
        if (!fs.existsSync(indexDataDir)) {
            fs.mkdirSync(indexDataDir, { recursive: true });
            console.log('创建index-data目录');
        }
        
        // 检查当日的PE/DP数据文件是否存在
        const today = new Date().toISOString().split('T')[0]; // 格式: YYYY-MM-DD
        const todayDataFile = path.join(indexDataDir, `pe-dp-data_${today}.json`);
        
        if (fs.existsSync(todayDataFile)) {
            console.log(`找到当日的PE/DP数据文件: ${todayDataFile}`);
            try {
                const cachedData = fs.readFileSync(todayDataFile, 'utf8');
                const parsedData = JSON.parse(cachedData);
                console.log(`从缓存文件读取到 ${parsedData.length} 个指数的PE/DP数据`);
                return parsedData;
            } catch (error) {
                console.error('读取缓存文件失败:', error.message);
                // 如果读取失败，继续获取新数据
            }
        }
        
        console.log('未找到当日数据文件，开始获取PE/DP数据...');
        
        // 读取指数列表.xlsx
        const workbook = XLSX.readFile(path.join(__dirname, '指数列表.xlsx'));
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonSheet = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // 提取指数代码 (假设在第一列, 跳过表头)
        const etfCodes = jsonSheet.slice(1).map(row => row[0]).filter(code => code);
        console.log(`从Excel文件中读取到 ${etfCodes.length} 个指数代码。`);

        // 获取所有指数的PE和DP数据
        const fetcher = new CSIndexFetcher({ log: console.log });
        const promises = etfCodes.map(code => fetcher.getETFData(String(code)));
        const results = await Promise.allSettled(promises);

        const successfulResults = [];
        const failedResults = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.success) {
                successfulResults.push(result.value);
            } else {
                const reason = result.status === 'rejected' ? result.reason : result.value.error;
                failedResults.push({ code: etfCodes[index], reason });
                console.error(`获取代码 ${etfCodes[index]} 数据失败:`, reason);
            }
        });

        console.log(`成功获取 ${successfulResults.length} 个指数的PE/DP数据。`);
        console.log(`失败 ${failedResults.length} 个。`);
        
        // 将获取到的数据保存到文件
        try {
            fs.writeFileSync(todayDataFile, JSON.stringify(successfulResults, null, 2), 'utf8');
            console.log(`PE/DP数据已保存到: ${todayDataFile}`);
        } catch (error) {
            console.error('保存PE/DP数据文件失败:', error.message);
        }
        
        return successfulResults;
    } catch (error) {
        console.error('获取PE/DP数据失败:', error.message);
        return [];
    }
}

// 获取指数名称
function getIndexName(indexCode, indexMapping) {
    return indexMapping[indexCode] || indexCode; // 如果找不到映射，返回原始代码
}

// 生成表格行
function generateTableRows(jsonData, indexMapping) {
    let rows = '';
    jsonData.forEach(item => {
        if (item.data && item.data.length > 0) {
            const firstData = item.data[0];
            rows += '<tr data-index-code="' + item.indexCode + '"><td>' + item.indexCode + '</td><td>' + firstData.name + '</td><td class="number">' + firstData.阶段性收益_近一月 + '</td><td class="number">' + firstData.阶段性收益_近三月 + '</td><td class="number">' + firstData.阶段性收益_年至今 + '</td><td class="number">' + firstData.年化收益_近一年 + '</td><td class="number">' + firstData.年化收益_近三年 + '</td><td class="number">' + firstData.年化收益_近五年 + '</td><td class="number">' + firstData.年化波动率_近一年 + '</td><td class="number">' + firstData.年化波动率_近三年 + '</td><td class="number">' + firstData.年化波动率_近五年 + '</td></tr>';
            if (item.data.length > 1) {
                const secondData = item.data[1];
                rows += '<tr class="total-return" data-index-code="' + item.indexCode + '"><td>' + item.indexCode + '</td><td>' + secondData.name + '</td><td class="number">' + secondData.阶段性收益_近一月 + '</td><td class="number">' + secondData.阶段性收益_近三月 + '</td><td class="number">' + secondData.阶段性收益_年至今 + '</td><td class="number">' + secondData.年化收益_近一年 + '</td><td class="number">' + secondData.年化收益_近三年 + '</td><td class="number">' + secondData.年化收益_近五年 + '</td><td class="number">' + secondData.年化波动率_近一年 + '</td><td class="number">' + secondData.年化波动率_近三年 + '</td><td class="number">' + secondData.年化波动率_近五年 + '</td></tr>';
            }
        }
    });
    return rows;
}

// 读取模板文件
function loadTemplate() {
    try {
        const templatePath = path.join(__dirname, 'cs-index-report-template.html');
        return fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
        console.error('读取模板文件失败:', error.message);
        return null;
    }
}

// 生成HTML内容
function generateHTML(jsonData, indexMapping, peDpData) {
    // 读取模板
    let template = loadTemplate();
    if (!template) {
        console.error('无法读取模板文件');
        return null;
    }
    
    // 生成表格行
    const tableRows = generateTableRows(jsonData, indexMapping);
    
    // 替换模板中的占位符
    const html = template
        .replace('{{TABLE_ROWS}}', tableRows)
        .replace('{{GENERATION_TIME}}', new Date().toLocaleString('zh-CN'))
        .replace('{{INDEX_DATA}}', JSON.stringify(jsonData))
        .replace('{{INDEX_MAPPING}}', JSON.stringify(indexMapping))
        .replace('{{PE_DP_DATA}}', JSON.stringify(peDpData));
    
    return html;
}

// 主函数
async function generateIndexReport() {
    console.log('开始生成静态HTML文件...');
    
    // 读取JSON数据
    const jsonData = loadJsonData();
    
    if (jsonData.length === 0) {
        console.error('没有读取到数据，请检查JSON文件');
        return;
    }
    
    console.log(`读取到 ${jsonData.length} 个指数的数据`);
    
    // 读取指数列表Excel文件
    const indexMapping = loadIndexList();
    console.log(`从Excel文件读取到 ${Object.keys(indexMapping).length} 个指数映射`);
    
    // 获取PE/DP数据
    const peDpData = await loadPeDpData();
    
    // 生成HTML
    const htmlContent = generateHTML(jsonData, indexMapping, peDpData);
    
    if (!htmlContent) {
        console.error('生成HTML内容失败');
        return;
    }
    
    // 写入文件
    const reportDir = path.join(__dirname, 'report-data');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }
    const today = new Date().toISOString().split('T')[0];
    const outputPath = path.join(reportDir, `cs-index-report-${today}.html`);
    fs.writeFileSync(outputPath, htmlContent, 'utf8');
    
    console.log(`静态HTML文件已生成: ${outputPath}`);
    
    // 在浏览器中打开文件
    try {
        await open(outputPath, { wait: false });
        console.log('报告文件应该已经在新的浏览器标签页中打开。');
    } catch (err) {
        console.error('无法自动打开报告文件:', err);
        console.log('请手动在浏览器中打开以下文件:');
        console.log(outputPath);
    }
}

async function main() {
    await generateReport();
}


// 只有在直接运行时才执行main函数
if (require.main === module) {
    main();
}

module.exports = {
    generateIndexReport
}; 
