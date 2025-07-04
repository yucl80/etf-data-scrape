const axios = require('axios');
const fs = require('fs');
const pdfParse = require('pdf-parse');

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

async function extractMetricsFromPDF(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);
  const text = data.text.replace(/\n+/g, ' ');
  console.log('PDF文本内容:', text.substring(0, 1000)); // 输出前1000个字符用于调试

  // 新逻辑：定位字段并提取数字
  let pe = null, pb = null, dy = null;
  const baseMatch = text.match(/股息率\s*市净率\s*预期市盈率[\s\S]{0,40}/);
  console.log('baseMatch:', baseMatch);
  if (baseMatch) {
    // 先将小数后紧跟数字的位置加空格
    let numstr = baseMatch[0].replace(/(\d+\.\d\d)/g, '$1 ');
    numstr = numstr.replace(/(%)/g, ' $1 ');
    const nums = numstr.match(/\d+\.\d+|\d+\.\d+%|\d+%/g);
    console.log('nums:', nums);
    // 正确顺序：nums[1] = 市盈率，nums[2] = 市净率，nums[3] = 股息率
    if (nums && nums.length >= 4) {
      pe = nums[1]; // 预期市盈率
      pb = nums[2]; // 市净率
      dy = nums[3]; // 股息率
    }
  }

  // 提取"截至"时间
  let reportDate = null;
  const dateMatch = text.match(/截至\s*([A-Z]{3}\s+\d{1,2},\s+\d{4})/);
  console.log('dateMatch:', dateMatch);
  if (dateMatch) {
    reportDate = dateMatch[1];
  }

  return {
    预期市盈率: pe,
    市净率: pb,
    股息率: dy,
    截至时间: reportDate,
  };
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
      
      const metrics = await extractMetricsFromPDF(pdfPath);
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
  getETFResultByStock
};