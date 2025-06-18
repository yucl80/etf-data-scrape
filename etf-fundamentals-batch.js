const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const HSIFundamentalsScraper = require('./hsi-fundamentals-scraper');

class ETFFundamentalsBatchProcessor {
    constructor() {
        this.config = null;
        this.scraper = null;
        this.processedIndices = new Set(); // 记录已处理的指数代码
        this.results = []; // 存储所有ETF的结果
        this.loadConfig();
    }

    loadConfig() {
        try {
            const configPath = path.join(__dirname, 'etf-index-mapping.json');
            this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log('✅ 配置文件加载成功');
            
            // 确保输出目录存在
            this.ensureDirectories();
        } catch (error) {
            console.error('❌ 加载配置文件失败:', error.message);
            process.exit(1);
        }
    }

    ensureDirectories() {
        const dirs = [
            this.config.settings.dataDirectory,
            this.config.settings.logDirectory
        ];
        
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 创建目录: ${dir}`);
            }
        });
    }

    // 检查当天是否已有数据文件
    checkTodayDataExists() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const todayDataFile = path.join(this.config.settings.dataDirectory, `etf-fundamentals-${today}.json`);
            
            if (fs.existsSync(todayDataFile)) {
                console.log(`📋 发现当天数据文件: ${todayDataFile}`);
                return todayDataFile;
            }
            
            return null;
        } catch (error) {
            console.error('❌ 检查当天数据文件失败:', error.message);
            return null;
        }
    }

    // 从当天数据文件加载结果
    loadTodayData(dataFile) {
        try {
            const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
            this.results = data.results || [];
            this.processedIndices = new Set(data.processedIndices || []);
            
            console.log(`✅ 成功加载当天数据:`);
            console.log(`  - 总ETF数量: ${this.results.length}`);
            console.log(`  - 已处理指数: ${this.processedIndices.size}`);
            
            return true;
        } catch (error) {
            console.error('❌ 加载当天数据失败:', error.message);
            return false;
        }
    }

    async initialize() {
        try {
            this.scraper = new HSIFundamentalsScraper();
            const initialized = await this.scraper.initialize();
            if (!initialized) {
                throw new Error('浏览器初始化失败');
            }
            console.log('✅ 批量处理器初始化成功');
            return true;
        } catch (error) {
            console.error('❌ 批量处理器初始化失败:', error);
            return false;
        }
    }

    async login() {
        try {
            // 从配置文件读取登录凭据
            const hsiConfig = JSON.parse(fs.readFileSync('hsi-config.json', 'utf8'));
            const username = hsiConfig.hsi.credentials.username;
            const password = hsiConfig.hsi.credentials.password;

            if (!username || !password) {
                throw new Error('登录凭据未配置');
            }

            console.log(`🔐 开始登录，用户名: ${username}`);
            const loginSuccess = await this.scraper.login(username, password);
            
            if (loginSuccess) {
                console.log('✅ 登录成功');
                return true;
            } else {
                throw new Error('登录失败');
            }
        } catch (error) {
            console.error('❌ 登录失败:', error.message);
            return false;
        }
    }

    async processETF(etfCode, indexInfo) {
        try {
            console.log(`\n📊 处理ETF: ${etfCode} -> 指数: ${indexInfo.indexName} (${indexInfo.indexCode})`);
            
            // 检查是否已经处理过这个指数代码
            if (this.processedIndices.has(indexInfo.indexCode)) {
                console.log(`⏭️ 指数 ${indexInfo.indexCode} 已处理，跳过...`);
                return this.getCachedResult(indexInfo.indexCode, etfCode, indexInfo);
            }

            // 构建基本面数据URL
            const fundamentalsUrl = `https://www.hsi.com.hk/index360/schi/indexes?id=${indexInfo.indexCode}`;
            
            // 直接访问基本面数据页面（修改scraper的URL）
            this.scraper.fundamentalsUrl = fundamentalsUrl;
            const navigationSuccess = await this.scraper.navigateToFundamentals();
            if (!navigationSuccess) {
                throw new Error('访问基本面数据页面失败');
            }

            // 提取基本面数据
            const data = await this.scraper.extractFundamentalsData();
            if (!data || !data.foundData || data.foundData.length === 0) {
                throw new Error('未提取到基本面数据');
            }

            // 构建结果对象
            const result = {
                etfCode: etfCode,
                indexCode: indexInfo.indexCode,
                indexName: indexInfo.indexName,
                dividendYield: null,
                peRatio: null,
                timestamp: new Date().toISOString(),
                source: 'HSI Fundamentals'
            };

            // 提取周息率和市盈率
            data.foundData.forEach(item => {
                if (item.type === 'dividendYield') {
                    result.dividendYield = item.value;
                } else if (item.type === 'peRatio') {
                    result.peRatio = item.value;
                }
            });

            // 标记该指数已处理
            this.processedIndices.add(indexInfo.indexCode);
            
            // 缓存结果
            this.cacheResult(indexInfo.indexCode, result);

            console.log(`✅ ETF ${etfCode} 处理完成:`);
            console.log(`  - 周息率: ${result.dividendYield || 'N/A'}`);
            console.log(`  - 市盈率: ${result.peRatio || 'N/A'}`);

            return result;

        } catch (error) {
            console.error(`❌ 处理ETF ${etfCode} 失败:`, error.message);
            return {
                etfCode: etfCode,
                indexCode: indexInfo.indexCode,
                indexName: indexInfo.indexName,
                dividendYield: null,
                peRatio: null,
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    cacheResult(indexCode, result) {
        try {
            const cacheFile = path.join(this.config.settings.dataDirectory, `cache_${indexCode}.json`);
            fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ 缓存结果失败:', error.message);
        }
    }

    getCachedResult(indexCode, etfCode, indexInfo) {
        try {
            const cacheFile = path.join(this.config.settings.dataDirectory, `cache_${indexCode}.json`);
            if (fs.existsSync(cacheFile)) {
                const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                // 检查缓存是否过期
                const cacheTime = new Date(cached.timestamp);
                const now = new Date();
                const hoursDiff = (now - cacheTime) / (1000 * 60 * 60);
                
                if (hoursDiff < this.config.settings.cacheExpiryHours) {
                    console.log(`📋 使用缓存数据 (${hoursDiff.toFixed(1)}小时前)`);
                    return {
                        ...cached,
                        etfCode: etfCode, // 更新为当前ETF代码
                        fromCache: true
                    };
                } else {
                    console.log(`⏰ 缓存已过期 (${hoursDiff.toFixed(1)}小时)`);
                    this.processedIndices.delete(indexCode); // 重新处理
                    return null;
                }
            }
        } catch (error) {
            console.error('❌ 读取缓存失败:', error.message);
        }
        return null;
    }

    async processAllETFs() {
        try {
            console.log('🚀 开始批量处理所有ETF...');
            console.log(`📋 总共需要处理 ${Object.keys(this.config.etfIndexMapping).length} 个ETF`);

            // 检查当天是否已有数据文件
            const todayDataFile = this.checkTodayDataExists();
            if (todayDataFile) {
                // 从当天数据文件加载结果
                const loaded = this.loadTodayData(todayDataFile);
                if (loaded) {
                    console.log('✅ 当天数据已存在，直接使用缓存数据');
                    console.log(`📊 统计信息:`);
                    console.log(`  - 总ETF数量: ${this.results.length}`);
                    console.log(`  - 成功处理: ${this.results.filter(r => !r.error).length}`);
                    console.log(`  - 失败数量: ${this.results.filter(r => r.error).length}`);
                    console.log(`  - 实际访问指数: ${this.processedIndices.size}`);
                    return this.results;
                } else {
                    console.log('⚠️ 加载当天数据失败，将重新获取数据');
                }
            }

            // 初始化
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('初始化失败');
            }

            // 登录（只登录一次）
            const loginSuccess = await this.login();
            if (!loginSuccess) {
                throw new Error('登录失败');
            }

            // 处理所有ETF
            const etfCodes = Object.keys(this.config.etfIndexMapping);
            let processedCount = 0;
            let successCount = 0;

            for (const etfCode of etfCodes) {
                try {
                    const indexInfo = this.config.etfIndexMapping[etfCode];
                    const result = await this.processETF(etfCode, indexInfo);
                    
                    if (result) {
                        this.results.push(result);
                        if (!result.error) {
                            successCount++;
                        }
                    }
                    
                    processedCount++;
                    console.log(`📈 进度: ${processedCount}/${etfCodes.length} (${((processedCount/etfCodes.length)*100).toFixed(1)}%)`);
                    
                    // 添加延迟避免请求过于频繁
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                } catch (error) {
                    console.error(`❌ 处理ETF ${etfCode} 时发生错误:`, error.message);
                    this.results.push({
                        etfCode: etfCode,
                        indexCode: this.config.etfIndexMapping[etfCode].indexCode,
                        indexName: this.config.etfIndexMapping[etfCode].indexName,
                        dividendYield: null,
                        peRatio: null,
                        timestamp: new Date().toISOString(),
                        error: error.message
                    });
                }
            }

            console.log(`\n✅ 批量处理完成!`);
            console.log(`📊 统计信息:`);
            console.log(`  - 总ETF数量: ${etfCodes.length}`);
            console.log(`  - 成功处理: ${successCount}`);
            console.log(`  - 失败数量: ${etfCodes.length - successCount}`);
            console.log(`  - 实际访问指数: ${this.processedIndices.size}`);

            return this.results;

        } catch (error) {
            console.error('❌ 批量处理失败:', error);
            return this.results;
        } finally {
            if (this.scraper) {
                await this.scraper.close();
            }
        }
    }

    saveResults() {
        try {
            const timestamp = new Date().toISOString().split('T')[0];
            const resultsFile = path.join(this.config.settings.dataDirectory, `etf-fundamentals-${timestamp}.json`);
            
            // 检查当天是否已有数据文件
            if (fs.existsSync(resultsFile)) {
                console.log(`📋 当天数据文件已存在: ${resultsFile}`);
                console.log('💾 跳过保存，使用现有文件');
                return resultsFile;
            }
            
            const outputData = {
                timestamp: new Date().toISOString(),
                totalETFs: this.results.length,
                processedIndices: Array.from(this.processedIndices),
                results: this.results
            };

            fs.writeFileSync(resultsFile, JSON.stringify(outputData, null, 2));
            console.log(`💾 结果已保存到: ${resultsFile}`);

            // 生成CSV格式的摘要
            this.generateCSVSummary(timestamp);

            return resultsFile;
        } catch (error) {
            console.error('❌ 保存结果失败:', error.message);
            return null;
        }
    }

    generateCSVSummary(timestamp) {
        try {
            const csvFile = path.join(this.config.settings.dataDirectory, `etf-fundamentals-${timestamp}.csv`);
            
            // CSV头部
            const csvHeader = 'ETF代码,指数代码,指数名称,周息率,市盈率,时间戳,错误信息\n';
            
            // CSV数据行
            const csvRows = this.results.map(result => {
                return [
                    result.etfCode,
                    result.indexCode,
                    result.indexName,
                    result.dividendYield || '',
                    result.peRatio || '',
                    result.timestamp,
                    result.error || ''
                ].join(',');
            }).join('\n');

            fs.writeFileSync(csvFile, csvHeader + csvRows);
            console.log(`📊 CSV摘要已保存到: ${csvFile}`);

        } catch (error) {
            console.error('❌ 生成CSV摘要失败:', error.message);
        }
    }

    printSummary() {
        console.log('\n📋 === ETF基本面数据汇总 ===');
        console.log('ETF代码\t指数代码\t指数名称\t\t周息率\t市盈率\t状态');
        console.log('--------\t--------\t--------\t\t----\t----\t----');
        
        this.results.forEach(result => {
            const status = result.error ? '❌' : '✅';
            const dividendYield = result.dividendYield ? `${result.dividendYield}%` : 'N/A';
            const peRatio = result.peRatio ? `${result.peRatio}` : 'N/A';
            
            console.log(`${result.etfCode}\t${result.indexCode}\t${result.indexName}\t${dividendYield}\t${peRatio}\t${status}`);
        });
    }
}

// 主函数
async function main() {
    const processor = new ETFFundamentalsBatchProcessor();
    
    try {
        console.log('🚀 ETF基本面数据批量处理器启动');
        console.log('=' * 50);
        
        // 处理所有ETF
        const results = await processor.processAllETFs();
        
        // 保存结果
        processor.saveResults();
        
        // 打印汇总
        processor.printSummary();
        
        console.log('\n✅ 所有处理完成！');
        
    } catch (error) {
        console.error('❌ 主程序执行错误:', error);
    }
}

module.exports = ETFFundamentalsBatchProcessor;

if (require.main === module) {
    main();
} 