// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal ERC20 interface with metadata.
interface IERC20Metadata {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

/// @notice Chainlink compatible price feed interface.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @notice Minimal Uniswap V2 style router interface.
interface IRouter {
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @dev Lightweight context helper.
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }
}

/// @dev Basic ownable control with single owner.
abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        require(initialOwner != address(0), "OwnerZero");
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        require(_msgSender() == _owner, "NotOwner");
        _;
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "OwnerZero");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

/// @dev Simple ERC20 implementation with adjustable decimals.
contract ERC20 is Context {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;
    string private _name;
    string private _symbol;
    uint8 private _decimals;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public view returns (uint8) {
        return _decimals;
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        _transfer(_msgSender(), to, amount);
        return true;
    }

    function allowance(address owner, address spender) public view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        uint256 currentAllowance = _allowances[from][_msgSender()];
        require(currentAllowance >= amount, "Allowance");
        unchecked {
            _approve(from, _msgSender(), currentAllowance - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender] + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
        uint256 currentAllowance = _allowances[_msgSender()][spender];
        require(currentAllowance >= subtractedValue, "Allowance");
        unchecked {
            _approve(_msgSender(), spender, currentAllowance - subtractedValue);
        }
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0) && to != address(0), "ZeroAddr");
        uint256 fromBalance = _balances[from];
        require(fromBalance >= amount, "Balance");
        unchecked {
            _balances[from] = fromBalance - amount;
        }
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address account, uint256 amount) internal {
        require(account != address(0), "ZeroAddr");
        _totalSupply += amount;
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal {
        require(account != address(0), "ZeroAddr");
        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "Balance");
        unchecked {
            _balances[account] = accountBalance - amount;
        }
        _totalSupply -= amount;
        emit Transfer(account, address(0), amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0) && spender != address(0), "ZeroAddr");
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}

/// @title CDP (Collateralised Debt Position) stablecoin backed by a meme token collateral.
/// @notice Users lock collateral to mint a USD-pegged stablecoin with enforced collateral ratios.
contract CDPStablecoin is ERC20, Ownable {
    struct Position {
        uint256 collateralAmount; // collateral token amount held for the position
        uint256 debtAmount; // stablecoin debt minted
    }

    IERC20Metadata public immutable collateralToken;
    IAggregatorV3 public priceFeed;
    IRouter public router;

    uint8 public immutable collateralDecimals;
    uint8 public priceFeedDecimals;

    uint256 private constant RATIO_PRECISION = 1e4; // basis points precision
    uint256 public constant MIN_COLLATERAL_RATIO = 100000; // 1000%
    uint256 public constant LIQUIDATION_RATIO = 30000; // 300%
    uint256 public constant COLLATERAL_BURN_FEE_BPS = 500; // 5%
    uint256 public constant LIQUIDATION_REPAY_AMOUNT = 2e18; // 2 stablecoin (assumes 18 decimals)
    address public constant COLLATERAL_BURN_ADDRESS = address(0);

    mapping(address => Position) public positions;

    event CollateralDeposited(address indexed account, uint256 amount);
    event CollateralWithdrawn(address indexed account, uint256 amount);
    event StablecoinMinted(address indexed account, uint256 amount);
    event StablecoinBurned(address indexed account, uint256 amount);
    event PositionClosed(address indexed account, uint256 collateralReturned, uint256 collateralBurned);
    event PositionRebalanced(address indexed account, uint256 collateralSold, uint256 stableBurned);
    event PriceFeedUpdated(address indexed feed);
    event RouterUpdated(address indexed router);

    constructor(
        address owner_,
        IERC20Metadata collateralToken_,
        IAggregatorV3 priceFeed_,
        IRouter router_
    ) ERC20("CDP Stablecoin", "cUSD", 18) Ownable(owner_) {
        collateralToken = collateralToken_;
        priceFeed = priceFeed_;
        router = router_;
        collateralDecimals = collateralToken_.decimals();
        priceFeedDecimals = priceFeed_.decimals();
    }

    // ---------------------------
    // User position management
    // ---------------------------

    function depositCollateral(uint256 collateralAmount) external {
        require(collateralAmount > 0, "ZeroCollateral");
        Position storage position = positions[_msgSender()];
        position.collateralAmount += collateralAmount;
        require(collateralToken.transferFrom(_msgSender(), address(this), collateralAmount), "TransferFail");
        emit CollateralDeposited(_msgSender(), collateralAmount);
    }

    function withdrawCollateral(uint256 collateralAmount) external {
        Position storage position = positions[_msgSender()];
        require(collateralAmount > 0 && collateralAmount <= position.collateralAmount, "BadAmount");
        uint256 newCollateral = position.collateralAmount - collateralAmount;
        require(_isHealthyPosition(newCollateral, position.debtAmount), "Underwater");
        position.collateralAmount = newCollateral;
        require(collateralToken.transfer(_msgSender(), collateralAmount), "TransferFail");
        emit CollateralWithdrawn(_msgSender(), collateralAmount);
    }

    function mintStablecoin(uint256 mintAmount) external {
        require(mintAmount > 0, "ZeroMint");
        Position storage position = positions[_msgSender()];
        require(position.collateralAmount > 0, "NoCollateral");
        uint256 newDebt = position.debtAmount + mintAmount;
        require(_isHealthyPosition(position.collateralAmount, newDebt), "InsufficientCollateral");
        position.debtAmount = newDebt;
        _mint(_msgSender(), mintAmount);
        emit StablecoinMinted(_msgSender(), mintAmount);
    }

    function burnStablecoin(uint256 burnAmount) external {
        require(burnAmount > 0, "ZeroBurn");
        Position storage position = positions[_msgSender()];
        require(position.debtAmount >= burnAmount, "Overburn");
        position.debtAmount -= burnAmount;
        _burn(_msgSender(), burnAmount);
        emit StablecoinBurned(_msgSender(), burnAmount);
    }

    function repayAndClose() external {
        Position storage position = positions[_msgSender()];
        require(position.debtAmount > 0, "NoDebt");
        uint256 debt = position.debtAmount;
        position.debtAmount = 0;
        _burn(_msgSender(), debt);

        uint256 collateral = position.collateralAmount;
        position.collateralAmount = 0;

        uint256 burnPortion = (collateral * COLLATERAL_BURN_FEE_BPS) / RATIO_PRECISION;
        uint256 userPortion = collateral - burnPortion;

        if (burnPortion > 0) {
            require(collateralToken.transfer(COLLATERAL_BURN_ADDRESS, burnPortion), "BurnFail");
        }
        require(collateralToken.transfer(_msgSender(), userPortion), "TransferFail");

        emit PositionClosed(_msgSender(), userPortion, burnPortion);
    }

    // ---------------------------
    // Risk management
    // ---------------------------

    function rebalancePosition(
        address account,
        uint256 amountInMax,
        uint256 amountOutMin,
        address[] calldata path
    ) external {
        Position storage position = positions[account];
        require(position.debtAmount > 0, "NoDebt");
        require(_collateralRatio(position.collateralAmount, position.debtAmount) < LIQUIDATION_RATIO, "Healthy");
        require(path.length >= 2, "PathShort");
        require(path[0] == address(collateralToken), "PathStart");
        require(path[path.length - 1] == address(this), "PathEnd");

        uint256 repayAmount = position.debtAmount > LIQUIDATION_REPAY_AMOUNT
            ? LIQUIDATION_REPAY_AMOUNT
            : position.debtAmount;
        require(repayAmount >= 1e18, "DebtTooSmall"); // ensure at least 1 stable to retire

        _approveCollateralToRouter(amountInMax);
        uint256[] memory amounts = router.swapTokensForExactTokens(
            repayAmount,
            amountInMax,
            path,
            address(this),
            block.timestamp
        );
        uint256 collateralSold = amounts[0];
        require(collateralSold <= position.collateralAmount, "SellTooMuch");
        position.collateralAmount -= collateralSold;
        position.debtAmount -= repayAmount;

        require(balanceOf(address(this)) >= repayAmount, "SwapMissingStable");
        _burn(address(this), repayAmount);

        emit PositionRebalanced(account, collateralSold, repayAmount);
    }

    // ---------------------------
    // Admin controls
    // ---------------------------

    function setPriceFeed(IAggregatorV3 newFeed) external onlyOwner {
        require(address(newFeed) != address(0), "ZeroFeed");
        priceFeed = newFeed;
        priceFeedDecimals = newFeed.decimals();
        emit PriceFeedUpdated(address(newFeed));
    }

    function setRouter(IRouter newRouter) external onlyOwner {
        require(address(newRouter) != address(0), "ZeroRouter");
        router = newRouter;
        emit RouterUpdated(address(newRouter));
    }

    // ---------------------------
    // View helpers
    // ---------------------------

    function getPosition(address account) external view returns (uint256 collateralAmount, uint256 debtAmount) {
        Position storage position = positions[account];
        return (position.collateralAmount, position.debtAmount);
    }

    function collateralValueUSD(address account) external view returns (uint256) {
        return _collateralValue(positions[account].collateralAmount);
    }

    function collateralRatio(address account) external view returns (uint256) {
        Position storage position = positions[account];
        return _collateralRatio(position.collateralAmount, position.debtAmount);
    }

    function isHealthy(address account) external view returns (bool) {
        Position storage position = positions[account];
        return _isHealthyPosition(position.collateralAmount, position.debtAmount);
    }

    // ---------------------------
    // Internal helpers
    // ---------------------------

    function _isHealthyPosition(uint256 collateralAmount, uint256 debtAmount) internal view returns (bool) {
        if (debtAmount == 0) {
            return true;
        }
        return _collateralRatio(collateralAmount, debtAmount) >= MIN_COLLATERAL_RATIO;
    }

    function _collateralRatio(uint256 collateralAmount, uint256 debtAmount) internal view returns (uint256) {
        if (debtAmount == 0) {
            return type(uint256).max;
        }
        uint256 collateralUSD = _collateralValue(collateralAmount);
        uint256 debtUSD = _scaleAmount(debtAmount, decimals(), 18);
        if (debtUSD == 0) {
            return type(uint256).max;
        }
        return (collateralUSD * RATIO_PRECISION) / debtUSD;
    }

    function _collateralValue(uint256 collateralAmount) internal view returns (uint256) {
        if (collateralAmount == 0) {
            return 0;
        }
        (, int256 price,, uint256 updatedAt,) = priceFeed.latestRoundData();
        require(price > 0, "InvalidPrice");
        require(updatedAt > 0, "StalePrice");
        uint256 collateralIn18 = _scaleAmount(collateralAmount, collateralDecimals, 18);
        return (collateralIn18 * uint256(price)) / (10 ** priceFeedDecimals);
    }

    function _scaleAmount(uint256 amount, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) {
            return amount;
        }
        if (fromDecimals < toDecimals) {
            return amount * (10 ** (toDecimals - fromDecimals));
        }
        return amount / (10 ** (fromDecimals - toDecimals));
    }

    function _approveCollateralToRouter(uint256 amountInMax) internal {
        require(collateralToken.approve(address(router), 0), "ApproveReset");
        require(collateralToken.approve(address(router), amountInMax), "ApproveFail");
    }
}
