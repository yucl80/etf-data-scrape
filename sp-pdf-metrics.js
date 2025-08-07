const axios = require('axios');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const etfIndexMap = config.spEtfIndexMap;

const baseUrl = 'https://www.spglobal.com/spdji/zh/idsenhancedfactsheet/file.pdf?calcFrequency=M&force_download=true&hostIdentifier=48190c8c-42c4-46af-8d1a-0cd5db894797&languageId=142&indexId=';

async function downloadPDF(url, outputPath) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Accept': 'application/pdf',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://www.spglobal.com/spdji/zh/',
    }
  });
  fs.writeFileSync(outputPath, response.data);
}

async function extractTable(pdfPath) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument(pdfPath);
  const pdf = await loadingTask.promise;
  let tableData = [];
  let found = false;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lines = content.items.map(item => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5]
    }));

    var foundData = false;
    var tableLines = [];
    lines.forEach(line => {
      if (line.text.includes('基本面')) {
        foundData = true;
      } else if (foundData) {
        if (line.text.includes('截至')) {
          foundData = false;
        } else {
          if (line.text.trim() !== '')
            tableLines.push(line);
        }
      }

    });
    const rowsMap = {};
    tableLines.forEach(line => {
      const yKey = Math.round(line.y); // 取整分组
      if (!rowsMap[yKey]) rowsMap[yKey] = [];
      rowsMap[yKey].push(line);
    });

    // 按y排序，x排序
    const rows = Object.values(rowsMap)
      .sort((a, b) => a[0].y - b[0].y)
      .map(row =>
        row.sort((a, b) => a.x - b.x).map(cell => cell.text)
      );

    tableData = rows;   
    if (tableData.length > 0) {
      let pd = tableData[0][3];
      pd = pd.replace(/%/g, '');
      return {
        预期市盈率: tableData[0][0],
        市净率: tableData[0][2],
        股息率: pd,
        截至时间: '',
      };
    }
  }

}


async function processAllETFs() {
  const results = [];
  const pdfDir = './sp-data';
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir);
  }
  for (const etf of etfIndexMap) {
    const pdfUrl = baseUrl + etf.indexCode;
    const pdfPath = `${pdfDir}/sp-index-factsheet-${etf.stock}.pdf`;
    try {
      // 检查文件是否已存在
      if (!fs.existsSync(pdfPath)) {
        console.log(`下载PDF文件: ${etf.stock}`);
        await downloadPDF(pdfUrl, pdfPath);
      } else {
        console.log(`PDF文件已存在，跳过下载: ${etf.stock}`);
      }

      const metrics = await extractTable(pdfPath);
      results.push({
        stock: etf.stock,
        indexCode: etf.indexCode,
        indexName: etf.indexName,
        ...metrics
      });
    } catch (err) {
      results.push({
        stock: etf.stock,
        indexCode: etf.indexCode,
        indexName: etf.indexName,
        error: err.message
      });
    }
  }
  return results;
}

// 根据 stockCode 获取对应的 ETF 指标信息
function getETFResultByStock(allResults, stockCode) {
  return allResults.find(item => item.stock === stockCode);
}

module.exports = {
  processAllETFs,
  getETFResultByStock,
  extractTable
};