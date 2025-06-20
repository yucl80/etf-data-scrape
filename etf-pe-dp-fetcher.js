const fetch = require('node-fetch');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

class ETFPEDPFetcher {
    constructor() {
        this.baseUrl = 'https://www.csindex.com.cn/csindex-home/index-list/funds-tracking-index';
        this.indicatorBaseUrl = 'https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/indicator/';
    }

    /**
     * 第一步：根据ETF代码获取对应的指数代码和指数名称
     * @param {string} etfCode - ETF代码，例如 "512890"
     * @returns {Promise<Object>} 返回包含指数代码和名称的对象
     */
    async getIndexInfo(etfCode) {
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                    'content-type': 'application/json;charset=UTF-8',
                    'sec-ch-ua': '"Microsoft Edge";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin'
                },
                body: JSON.stringify({
                    "lang": "cn",
                    "pager": {
                        "pageNum": 1,
                        "pageSize": 10
                    },
                    "searchInput": etfCode,
                    "fundsFilter": {
                        "fundSize": null,
                        "assetClass": null,
                        "fundType": null,
                        "coverage": null,
                        "market": null,
                        "fundAge": null,
                        "manager": null
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.success || !data.data || data.data.length === 0) {
                throw new Error(`未找到ETF代码 ${etfCode} 对应的指数信息`);
            }

            const fundInfo = data.data[0];
            return {
                etfCode: fundInfo.productCode,
                fundName: fundInfo.fundName,
                indexCode: fundInfo.indexCode,
                indexName: fundInfo.indexNameCn,
                success: true
            };
        } catch (error) {
            console.error('获取指数信息失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 第二步：根据指数代码获取Excel文件并提取PE和DP数据
     * @param {string} indexCode - 指数代码，例如 "H30269"
     * @returns {Promise<Object>} 返回包含PE和DP数据的对象
     */
    async getPEAndDPData(indexCode) {
        try {
            // 构建Excel文件URL
            const excelUrl = `${this.indicatorBaseUrl}${indexCode}indicator.xls`;
            
            console.log(`正在获取Excel文件: ${excelUrl}`);
            
            const response = await fetch(excelUrl);
            
            if (!response.ok) {
                throw new Error(`无法获取Excel文件，HTTP状态: ${response.status}`);
            }

            // 获取Excel文件内容
            const buffer = await response.buffer();
            
            // 读取Excel文件
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            
            // 获取第一个工作表
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // 将工作表转换为JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (!jsonData || jsonData.length === 0) {
                throw new Error('Excel文件为空或格式不正确');
            }

            // 获取第一行数据（标题行）
            const firstRow = jsonData[0];
            
            // 查找PE和DP列的索引
            let peIndex = -1;
            let dpIndex = -1;
            
            for (let i = 0; i < firstRow.length; i++) {
                const cellValue = firstRow[i];
                if (cellValue && typeof cellValue === 'string') {
                    if (cellValue.includes('市盈率') && cellValue.includes('P/E2')) {
                        peIndex = i;
                    } else if (cellValue.includes('股息率') && cellValue.includes('D/P2')) {
                        dpIndex = i;
                    }
                }
            }

            // 获取第二行数据（实际数值）
            const secondRow = jsonData[1];
            
            if (!secondRow) {
                throw new Error('Excel文件没有数据行');
            }

            const peValue = peIndex >= 0 ? secondRow[peIndex] : null;
            const dpValue = dpIndex >= 0 ? secondRow[dpIndex] : null;

            return {
                success: true,
                indexCode: indexCode,
                peValue: peValue,
                dpValue: dpValue,
                peColumnName: peIndex >= 0 ? firstRow[peIndex] : null,
                dpColumnName: dpIndex >= 0 ? firstRow[dpIndex] : null
            };
        } catch (error) {
            console.error('获取PE和DP数据失败:', error.message);
            return {
                success: false,
                error: error.message,
                indexCode: indexCode
            };
        }
    }

    /**
     * 主函数：根据ETF代码获取PE和DP数据
     * @param {string} etfCode - ETF代码
     * @returns {Promise<Object>} 返回完整的PE和DP信息
     */
    async getETFPEAndDP(etfCode) {
        console.log(`开始获取ETF ${etfCode} 的PE和DP数据...`);
        
        // 第一步：获取指数信息
        const indexInfo = await this.getIndexInfo(etfCode);
        
        if (!indexInfo.success) {
            return {
                success: false,
                error: indexInfo.error,
                etfCode: etfCode
            };
        }

        console.log(`找到指数信息: ${indexInfo.indexName} (${indexInfo.indexCode})`);
        
        // 第二步：获取PE和DP数据
        const peDpData = await this.getPEAndDPData(indexInfo.indexCode);
        
        if (!peDpData.success) {
            return {
                success: false,
                error: peDpData.error,
                etfCode: etfCode,
                indexCode: indexInfo.indexCode,
                indexName: indexInfo.indexName
            };
        }

        // 返回完整结果
        return {
            success: true,
            etfCode: etfCode,
            fundName: indexInfo.fundName,
            indexCode: indexInfo.indexCode,
            indexName: indexInfo.indexName,
            peValue: peDpData.peValue,
            dpValue: peDpData.dpValue,
            peColumnName: peDpData.peColumnName,
            dpColumnName: peDpData.dpColumnName
        };
    }

    /**
     * 批量获取多个ETF的PE和DP数据
     * @param {Array<string>} etfCodes - ETF代码数组
     * @returns {Promise<Array>} 返回结果数组
     */
    async getMultipleETFPEAndDP(etfCodes) {
        const results = [];
        
        for (const etfCode of etfCodes) {
            console.log(`\n处理ETF: ${etfCode}`);
            const result = await this.getETFPEAndDP(etfCode);
            results.push(result);
            
            // 添加延迟避免请求过于频繁
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        return results;
    }
}

// 使用示例
async function main() {
    const fetcher = new ETFPEDPFetcher();
    
    // 单个ETF示例
    const etfCode = '512890';
    const result = await fetcher.getETFPEAndDP(etfCode);
    
    if (result.success) {
        console.log('\n=== 获取结果 ===');
        console.log(`ETF代码: ${result.etfCode}`);
        console.log(`基金名称: ${result.fundName}`);
        console.log(`指数代码: ${result.indexCode}`);
        console.log(`指数名称: ${result.indexName}`);
        console.log(`市盈率(PE): ${result.peValue}`);
        console.log(`股息率(DP): ${result.dpValue}`);
    } else {
        console.error('获取失败:', result.error);
    }
    
    // 批量获取示例
    /*
    const etfCodes = ['512890', '515000', '588000'];
    const batchResults = await fetcher.getMultipleETFPEAndDP(etfCodes);
    
    console.log('\n=== 批量获取结果 ===');
    batchResults.forEach(result => {
        if (result.success) {
            console.log(`${result.etfCode}: PE=${result.peValue}, DP=${result.dpValue}`);
        } else {
            console.log(`${result.etfCode}: 失败 - ${result.error}`);
        }
    });
    */
}

// 如果直接运行此文件，则执行main函数
if (require.main === module) {
    main().catch(console.error);
}

module.exports = ETFPEDPFetcher; 