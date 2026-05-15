// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CrowdfundingDAO
/// @notice Minimal milestone-governed crowdfunding contract with a
///         time-bounded refund-voting window enforced on-chain.
contract CrowdfundingDAO {
    uint256 public constant REFUND_WINDOW = 14 days;

    address public immutable creator;
    uint256 public immutable goal;
    uint256 public immutable projectDeadline;
    uint256 public immutable refundDeadline;

    uint256 public totalRaised;
    bool public refunded;

    // On-chain IPFS media attestation. The creator publishes the CIDs of the
    // cover image and description JSON so anyone can verify the off-chain
    // metadata against an immutable on-chain record.
    string public imageCid;
    string public descriptionCid;
    bytes32 public imageCidHash;
    bytes32 public descriptionCidHash;

    mapping(address => uint256) public contributions;
    mapping(address => bool) public refundVoted;
    mapping(address => bool) public refundApprove;
    uint256 public refundYes;
    uint256 public refundNo;

    event Contributed(address indexed backer, uint256 amount);
    event RefundVoteCast(address indexed backer, bool approve);
    event RefundExecuted(uint256 totalRefunded);
    event MediaAttested(string imageCid, string descriptionCid, bytes32 imageHash, bytes32 descriptionHash);

    error NotBacker();
    error AlreadyRefunded();
    error WindowClosed();
    error WindowOpen();
    error DeadlineNotPassed();
    error GoalReached();
    error NoVotes();
    error NoMajority();
    error NotCreator();
    error EmptyCid();

    modifier onlyCreator() {
        if (msg.sender != creator) revert NotCreator();
        _;
    }

    /// @notice Publish/replace the IPFS CIDs that pin this project's media so
    ///         backers can verify off-chain content against an on-chain hash.
    function attestMedia(string calldata _imageCid, string calldata _descriptionCid) external onlyCreator {
        if (bytes(_imageCid).length == 0 && bytes(_descriptionCid).length == 0) revert EmptyCid();
        imageCid = _imageCid;
        descriptionCid = _descriptionCid;
        imageCidHash = keccak256(bytes(_imageCid));
        descriptionCidHash = keccak256(bytes(_descriptionCid));
        emit MediaAttested(_imageCid, _descriptionCid, imageCidHash, descriptionCidHash);
    }

    /// @notice Pure verification: returns true if the supplied CID matches the
    ///         attested on-chain hash for the given asset kind ("image" or "description").
    function verifyMedia(string calldata kind, string calldata cid) external view returns (bool) {
        bytes32 h = keccak256(bytes(cid));
        bytes32 k = keccak256(bytes(kind));
        if (k == keccak256(bytes("image"))) return h == imageCidHash && imageCidHash != bytes32(0);
        if (k == keccak256(bytes("description"))) return h == descriptionCidHash && descriptionCidHash != bytes32(0);
        return false;
    }

    constructor(address _creator, uint256 _goal, uint256 _projectDeadline) {
        require(_creator != address(0), "creator=0");
        require(_goal > 0, "goal=0");
        require(_projectDeadline > block.timestamp, "deadline<=now");
        creator = _creator;
        goal = _goal;
        projectDeadline = _projectDeadline;
        refundDeadline = _projectDeadline + REFUND_WINDOW;
    }

    function contribute() external payable {
        require(block.timestamp < projectDeadline, "funding closed");
        require(msg.value > 0, "value=0");
        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;
        emit Contributed(msg.sender, msg.value);
    }

    function _projectFailed() internal view returns (bool) {
        return block.timestamp >= projectDeadline && totalRaised < goal;
    }

    /// @notice Backers vote yes/no on issuing refunds. Only valid while the
    ///         window is open: [projectDeadline, refundDeadline).
    function castRefundVote(bool approve) external {
        if (refunded) revert AlreadyRefunded();
        if (block.timestamp < projectDeadline) revert DeadlineNotPassed();
        if (block.timestamp >= refundDeadline) revert WindowClosed();
        if (totalRaised >= goal) revert GoalReached();
        if (contributions[msg.sender] == 0) revert NotBacker();

        if (refundVoted[msg.sender]) {
            // unflip previous tally
            if (refundApprove[msg.sender]) refundYes -= 1; else refundNo -= 1;
        }
        refundVoted[msg.sender] = true;
        refundApprove[msg.sender] = approve;
        if (approve) refundYes += 1; else refundNo += 1;

        emit RefundVoteCast(msg.sender, approve);
    }

    /// @notice Execute refunds if majority approved. Only callable once the
    ///         voting window has closed.
    function executeRefund(address[] calldata backers) external {
        if (refunded) revert AlreadyRefunded();
        if (block.timestamp < refundDeadline) revert WindowOpen();
        if (!_projectFailed()) revert GoalReached();
        uint256 total = refundYes + refundNo;
        if (total == 0) revert NoVotes();
        if (refundYes * 2 < total) revert NoMajority();

        refunded = true;
        uint256 sent;
        for (uint256 i = 0; i < backers.length; i++) {
            address b = backers[i];
            uint256 amt = contributions[b];
            if (amt == 0) continue;
            contributions[b] = 0;
            (bool ok, ) = b.call{ value: amt }("");
            require(ok, "refund failed");
            sent += amt;
        }
        emit RefundExecuted(sent);
    }
}
