const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const CSIndexFetcher = require('./cs-index-fetcher.js');

// 读取JSON数据
function loadJsonData() {
    try {
        const jsonPath = path.join(__dirname, 'index-return', 'all_index_returns.json');
        const jsonData = fs.readFileSync(jsonPath, 'utf8');
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
        const templatePath = path.join(__dirname, 'template.html');
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
async function main() {
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
    const outputPath = path.join(__dirname, 'index-data-static.html');
    fs.writeFileSync(outputPath, htmlContent, 'utf8');
    
    console.log(`静态HTML文件已生成: ${outputPath}`);
    console.log('可以直接在浏览器中打开该文件，无需服务器');
}

// 运行主函数
main(); 
