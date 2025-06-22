const fetch = require('node-fetch');
const XLSX = require('xlsx');

class CSIndexFetcher {
    constructor(options = {}) {
        this.log = options.log || (() => {});
    }

    async getETFData(code) {
        const url = `https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/indicator/${code}indicator.xls`;
        this.log(`Fetching data for code ${code} from ${url}`);

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
                success: true
            };
            
            return result;

        } catch (error) {
            this.log(`Error fetching or parsing data for code ${code}: ${error.message}`);
            return {
                etfCode: code,
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = CSIndexFetcher; 