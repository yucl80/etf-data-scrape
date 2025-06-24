const fetch = require('node-fetch');
const XLSX = require('xlsx');

class CSIndexFetcher {
    constructor(options = {}) {
        this.log = options.log || (() => {});
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 2000; // 2 seconds
        this.backoffMultiplier = options.backoffMultiplier || 1.5; // 指数退避倍数
    }

    // 延迟函数
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getETFData(code, retryCount = 0) {
        const url = `https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/indicator/${code}indicator.xls`;
        this.log(`Fetching data for code ${code} from ${url}${retryCount > 0 ? ` (retry ${retryCount}/${this.maxRetries})` : ''}`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to download file for code ${code}: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });

            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonSheet = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (jsonSheet.length < 2) {
                throw new Error(`No data found in the Excel file for code ${code}.`);
            }

            // Find header row
            const headerRow = jsonSheet[0];
            const dataRow = jsonSheet[1]; // data is in the second row

            const pe1Index = headerRow.findIndex(h => h && h.includes('P/E1'));
            const pe2Index = headerRow.findIndex(h => h && h.includes('P/E2'));
            const dp1Index = headerRow.findIndex(h => h && h.includes('D/P1'));
            const dp2Index = headerRow.findIndex(h => h && h.includes('D/P2'));
            const indexNameIndex = headerRow.findIndex(h => h && h.includes('Index Chinese Name'));
            
            const result = {
                etfCode: code,
                fundName: '', // Not available from this source
                indexName: indexNameIndex !== -1 ? dataRow[indexNameIndex] : 'N/A',
                pe1: pe1Index !== -1 ? dataRow[pe1Index] : null,
                pe2: pe2Index !== -1 ? dataRow[pe2Index] : null,
                dp1: dp1Index !== -1 ? dataRow[dp1Index] : null,
                dp2: dp2Index !== -1 ? dataRow[dp2Index] : null,
                success: true,
                retryCount: retryCount
            };
            
            return result;

        } catch (error) {
            this.log(`Error fetching or parsing data for code ${code}: ${error.message}`);
            
            // 检查是否还有重试次数
            if (retryCount < this.maxRetries) {
                const delayTime = this.retryDelay * Math.pow(this.backoffMultiplier, retryCount);
                this.log(`Retrying in ${delayTime}ms... (${retryCount + 1}/${this.maxRetries})`);
                
                await this.delay(delayTime);
                return this.getETFData(code, retryCount + 1);
            }
            
            // 所有重试都失败了
            return {
                etfCode: code,
                success: false,
                error: error.message,
                retryCount: retryCount,
                maxRetries: this.maxRetries
            };
        }
    }

    // 批量获取数据的方法，带重试机制
    async getETFDataBatch(codes, options = {}) {
        const results = [];
        const concurrency = options.concurrency || 5; // 并发数
        const batchDelay = options.batchDelay || 1000; // 批次间延迟

        for (let i = 0; i < codes.length; i += concurrency) {
            const batch = codes.slice(i, i + concurrency);
            this.log(`Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(codes.length / concurrency)}`);
            
            const batchPromises = batch.map(code => this.getETFData(code));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // 批次间延迟，避免请求过于频繁
            if (i + concurrency < codes.length) {
                this.log(`Waiting ${batchDelay}ms before next batch...`);
                await this.delay(batchDelay);
            }
        }
        
        return results;
    }
}

module.exports = CSIndexFetcher; 