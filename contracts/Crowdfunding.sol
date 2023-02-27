pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Crowdfunding is Initializable, OwnableUpgradeable {
    IERC20 public token;
    uint256 public goal;
    uint256 public deadline;
    mapping(address => uint256) public pledges;
    uint256 public totalPledged;
    bool public goalReached;

    event GoalReached(uint256 totalPledged);
    event Refunded(address recipient, uint256 amount);
    event FundsPledged(address sender, uint256 amount);
    event FundsWithdrawn(uint256 amount);

    function initialize(
        address _tokenAddress,
        uint256 _goal,
        uint256 _deadline
    ) public initializer {
        __Ownable_init();
        token = IERC20(_tokenAddress);
        goal = _goal;
        deadline = _deadline;
    }

    function pledge(uint256 amount) external {
        require(amount > 0, "Zero amount");
        require(block.timestamp < deadline, "Deadline has passed");
        require(!goalReached, "Goal has already been reached");
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Token transfer failed"
        );

        pledges[msg.sender] += amount;
        totalPledged += amount;

        emit FundsPledged(msg.sender, amount);

        if (totalPledged >= goal) {
            goalReached = true;
            emit GoalReached(totalPledged);
        }
    }

    function refund() external {
        require(block.timestamp >= deadline, "Deadline has not passed");
        require(!goalReached, "Goal has been reached");

        uint256 amount = pledges[msg.sender];
        require(amount > 0, "No pledge to refund");

        pledges[msg.sender] = 0;
        totalPledged -= amount;

        require(token.transfer(msg.sender, amount), "Token transfer failed");
        emit Refunded(msg.sender, amount);
    }

    function withdraw() external onlyOwner {
        require(goalReached, "Goal has not been reached");

        uint256 balance = token.balanceOf(address(this));
        require(token.transfer(msg.sender, balance), "Token transfer failed");

        emit FundsWithdrawn(balance);
    }
}
