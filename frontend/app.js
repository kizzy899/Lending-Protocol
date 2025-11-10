// 简易前端脚本：使用 ethers.js 与 LendingPool 合约交互
let provider;
let signer;
let account;
let poolContract;
let collateralContract;

const LENDING_POOL_ABI = [
	"function markets(address) view returns (bool listed, uint256 totalSupply, uint256 totalBorrows, uint256 lastUpdate, address interestModel, uint256 reserveFactor)",
	"function supplied(address, address) view returns (uint256)",
	"function borrowed(address, address) view returns (uint256)",
	"function deposit(address,uint256)",
	"function withdraw(address,uint256)",
	"function borrow(address,uint256)",
	"function repay(address,uint256,address)",
	"function collateralManager() view returns (address)"
];

const COLLATERAL_MANAGER_ABI = [
	"function getPrice(address) view returns (uint256)",
	"function ltv(address) view returns (uint16)",
	"function liquidationThreshold(address) view returns (uint16)",
	"function closeFactor() view returns (uint16)",
	"function liquidationBonus() view returns (uint16)"
];

const TOKEN_ABI = [
	"function approve(address spender, uint256 amount) external returns (bool)",
	"function allowance(address owner, address spender) external view returns (uint256)",
	"function balanceOf(address owner) external view returns (uint256)",
	"function decimals() external view returns (uint8)"
];

function log(...args) {
	const pre = document.getElementById('log');
	pre.textContent += args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ') + '\n';
	pre.scrollTop = pre.scrollHeight;
}

async function connectWallet() {
	if (window.ethereum === undefined) {
		alert('请安装 MetaMask 或在浏览器中注入以太坊提供者');
		return;
	}
	provider = new ethers.providers.Web3Provider(window.ethereum);
	await provider.send('eth_requestAccounts', []);
	signer = provider.getSigner();
	account = await signer.getAddress();
	document.getElementById('connectBtn').textContent = '已连接: ' + account;
	log('已连接钱包', account);
}

function toDecimals(n) {
	if (!n) return '0';
	return ethers.BigNumber.from(n).toString();
}

function formatWei(n) {
	return ethers.utils.formatUnits(n, 18);
}

async function loadContracts() {
	const poolAddr = document.getElementById('poolAddress').value.trim();
	const tokenAddr = document.getElementById('tokenAddress').value.trim();
	if (!poolAddr || !tokenAddr) { alert('请先输入 pool 和 token 地址'); return; }
	if (!provider) { provider = new ethers.providers.Web3Provider(window.ethereum); signer = provider.getSigner(); }
	poolContract = new ethers.Contract(poolAddr, LENDING_POOL_ABI, provider);
	tokenContract = new ethers.Contract(tokenAddr, TOKEN_ABI, provider);
	const cmAddr = await poolContract.collateralManager();
	collateralContract = new ethers.Contract(cmAddr, COLLATERAL_MANAGER_ABI, provider);

	// load market data
	const market = await poolContract.markets(tokenAddr);
	document.getElementById('marketCard').style.display = 'block';
	const marketInfo = `listed: ${market.listed}\n`+
		`totalSupply: ${formatWei(market.totalSupply)}\n`+
		`totalBorrows: ${formatWei(market.totalBorrows)}\n`+
		`lastUpdate: ${new Date(market.lastUpdate.toNumber()*1000).toLocaleString()}\n`+
		`interestModel: ${market.interestModel}\n`+
		`reserveFactor: ${market.reserveFactor}`;
	document.getElementById('marketInfo').textContent = marketInfo;

	// load user data if connected
	if (!signer) { signer = provider.getSigner(); }
	try { account = await signer.getAddress(); } catch(e) { account = null; }
	if (account) {
		poolContract = poolContract.connect(signer);
			tokenContract = tokenContract.connect(signer);
		document.getElementById('userCard').style.display = 'block';
		const sup = await poolContract.supplied(account, tokenAddr);
		const bor = await poolContract.borrowed(account, tokenAddr);
		const price = await collateralContract.getPrice(tokenAddr);
		const ltv = await collateralContract.ltv(tokenAddr);
			const bal = await tokenContract.balanceOf(account);
			const dec = await tokenContract.decimals().catch(()=>18);

		const userInfo = `address: ${account}\n`+
			`supplied: ${formatWei(sup)}\n`+
			`borrowed (principal): ${formatWei(bor)}\n`+
				`price (USD 1e18): ${formatWei(price)}\n`+
				`ltv (1e4): ${ltv}\n`+
				`token balance: ${formatWei(bal)} (decimals ${dec})`;
		document.getElementById('userInfo').textContent = userInfo;
	}

	attachHandlers(tokenAddr);
	log('市场加载完成');
}

function attachHandlers(tokenAddr) {
	const poolAddr = poolContract.address;
	document.getElementById('depositBtn').onclick = async () => {
		const v = document.getElementById('depositAmount').value || '0';
		const dec = await tokenContract.decimals().catch(()=>18);
		const amt = ethers.utils.parseUnits(v, dec);
		log('准备 deposit', tokenAddr, amt.toString());
		try {
			// check allowance and auto-approve if needed
			const allowance = await tokenContract.allowance(account, poolAddr);
			if (allowance.lt(amt)) {
				const approveInput = document.getElementById('approveAmount').value.trim();
				let toApprove;
				if (approveInput === '') {
					toApprove = ethers.constants.MaxUint256;
				} else {
					toApprove = ethers.utils.parseUnits(approveInput, dec);
				}
				log('需要 approve，发起 approve', toApprove.toString());
				const txA = await tokenContract.approve(poolAddr, toApprove);
				log('approve tx sent', txA.hash);
				await txA.wait();
				log('approve 已确认');
			}
			const tx = await poolContract.deposit(tokenAddr, amt);
			log('deposit tx sent', tx.hash);
			await tx.wait();
			log('deposit 已确认');
			await loadContracts();
		} catch(e) { log('deposit failed', e.message || e); }
	};

	document.getElementById('withdrawBtn').onclick = async () => {
		const v = document.getElementById('withdrawAmount').value || '0';
		const amt = ethers.utils.parseUnits(v, 18);
		try {
			const tx = await poolContract.withdraw(tokenAddr, amt);
			log('withdraw tx', tx.hash);
			await tx.wait();
			log('withdraw 已确认');
			await loadContracts();
		} catch(e) { log('withdraw failed', e.message || e); }
	};

	document.getElementById('borrowBtn').onclick = async () => {
		const v = document.getElementById('borrowAmount').value || '0';
		const amt = ethers.utils.parseUnits(v, 18);
		try {
			const tx = await poolContract.borrow(tokenAddr, amt);
			log('borrow tx', tx.hash);
			await tx.wait();
			log('borrow 已确认');
			await loadContracts();
		} catch(e) { log('borrow failed', e.message || e); }
	};

	document.getElementById('repayBtn').onclick = async () => {
		const v = document.getElementById('repayAmount').value || '0';
			const dec = await tokenContract.decimals().catch(()=>18);
			const amt = ethers.utils.parseUnits(v, dec);
			try {
				// ensure allowance for repay (payer must approve pool to pull tokens)
				const allowance = await tokenContract.allowance(account, poolAddr);
				if (allowance.lt(amt)) {
					log('repay 需要 approve，自动发起');
					const txA = await tokenContract.approve(poolAddr, ethers.constants.MaxUint256);
					log('approve tx sent', txA.hash);
					await txA.wait();
					log('approve 已确认');
				}
				const tx = await poolContract.repay(tokenAddr, amt, account);
				log('repay tx', tx.hash);
				await tx.wait();
				log('repay 已确认');
				await loadContracts();
			} catch(e) { log('repay failed', e.message || e); }
	};

		// manual approve buttons
		document.getElementById('approveBtn').onclick = async () => {
			const input = document.getElementById('approveAmount').value.trim();
			const dec = await tokenContract.decimals().catch(()=>18);
			let amt = ethers.constants.MaxUint256;
			if (input !== '') amt = ethers.utils.parseUnits(input, dec);
			try {
				const tx = await tokenContract.approve(poolAddr, amt);
				log('approve tx sent', tx.hash);
				await tx.wait();
				log('approve 已确认');
			} catch(e) { log('approve failed', e.message || e); }
		};

		document.getElementById('approveMaxBtn').onclick = async () => {
			const dec = await tokenContract.decimals().catch(()=>18);
			try {
				const tx = await tokenContract.approve(poolAddr, ethers.constants.MaxUint256);
				log('approveMax tx sent', tx.hash);
				await tx.wait();
				log('approveMax 已确认');
			} catch(e) { log('approveMax failed', e.message || e); }
		};

		document.getElementById('approveRepayBtn').onclick = async () => {
			const input = document.getElementById('repayAmount').value.trim();
			const dec = await tokenContract.decimals().catch(()=>18);
			let amt = ethers.constants.MaxUint256;
			if (input !== '') amt = ethers.utils.parseUnits(input, dec);
			try {
				const tx = await tokenContract.approve(poolAddr, amt);
				log('approve for repay tx sent', tx.hash);
				await tx.wait();
				log('approve for repay 已确认');
			} catch(e) { log('approve for repay failed', e.message || e); }
		};

		document.getElementById('approveRepayMaxBtn').onclick = async () => {
			try {
				const tx = await tokenContract.approve(poolAddr, ethers.constants.MaxUint256);
				log('approveRepayMax tx sent', tx.hash);
				await tx.wait();
				log('approveRepayMax 已确认');
			} catch(e) { log('approveRepayMax failed', e.message || e); }
		};
}

document.getElementById('connectBtn').onclick = connectWallet;
document.getElementById('loadBtn').onclick = loadContracts;

log('app.js 已加载 - 请先在页面上输入合约地址并连接钱包');
