const fs = require('fs');
const path = require('path');
const HSIFundamentalsScraper = require('./hsi-index-scraper');

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
            const configPath = path.join(__dirname, 'config.json');
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
            this.config.settings.dataDirectory
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
            const hsiConfig = this.config.hsi;
            const username = hsiConfig.credentials.username;
            const password = hsiConfig.credentials.password;
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

            // // 登录（只登录一次）
            // const loginSuccess = await this.login();
            // if (!loginSuccess) {
            //     throw new Error('登录失败');
            // }

            // 直接使用 getAllHsidata 方法获取所有指数数据
            console.log('📊 使用 getAllHsidata 方法批量获取所有指数数据...');
            const hsiData = await this.scraper.getAllHsidata(this.config.etfIndexMapping);
            
            if (!hsiData) {
                throw new Error('获取HSI数据失败');
            }

            // 检查是否返回了错误信息
            if (hsiData.success === false) {
                throw new Error(`获取HSI数据失败: ${hsiData.error || '未知错误'}`);
            }

            // 检查是否有结果数据
            if (!hsiData.results || !Array.isArray(hsiData.results)) {
                throw new Error('HSI数据格式错误：缺少结果数组');
            }

            // 将 HSI 数据转换为 ETF 结果格式
            this.results = [];
            this.processedIndices = new Set();
            
            hsiData.results.forEach(hsiResult => {
                // 构建ETF结果对象
                const etfResult = {
                    etfCode: hsiResult.etfCode,
                    indexCode: hsiResult.indexCode,
                    indexName: hsiResult.indexName,
                    dividendYield: null,
                    peRatio: null,
                    timestamp: hsiResult.timestamp || new Date().toISOString(),
                    source: 'HSI Fundamentals'
                };

                // 提取周息率和市盈率
                if (hsiResult.fundamentals && hsiResult.fundamentals.foundData) {
                    hsiResult.fundamentals.foundData.forEach(item => {
                        if (item.type === 'dividendYield') {
                            etfResult.dividendYield = item.value;
                        } else if (item.type === 'peRatio') {
                            etfResult.peRatio = item.value;
                        }
                    });
                }

                // 如果获取失败，添加错误信息
                if (!hsiResult.success) {
                    etfResult.error = hsiResult.error || '获取数据失败';
                } else {
                    // 标记该指数已处理
                    this.processedIndices.add(hsiResult.indexCode);
                }

                this.results.push(etfResult);
            });

            console.log(`\n✅ 批量处理完成!`);
            console.log(`📊 统计信息:`);
            console.log(`  - 总ETF数量: ${this.results.length}`);
            console.log(`  - 成功处理: ${this.results.filter(r => !r.error).length}`);
            console.log(`  - 失败数量: ${this.results.filter(r => r.error).length}`);
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