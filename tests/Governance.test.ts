import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, asciiCV, optionalCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PROPOSAL_DESCRIPTION = 101;
const ERR_INVALID_VOTING_PERIOD = 102;
const ERR_INVALID_QUORUM = 103;
const ERR_INVALID_THRESHOLD = 104;
const ERR_PROPOSAL_ALREADY_EXISTS = 105;
const ERR_PROPOSAL_NOT_FOUND = 106;
const ERR_VOTING_CLOSED = 107;
const ERR_INSUFFICIENT_BALANCE = 108;
const ERR_ALREADY_VOTED = 109;
const ERR_PROPOSAL_EXECUTED = 110;
const ERR_PROPOSAL_NOT_PASSED = 111;
const ERR_TIMELOCK_NOT_EXPIRED = 112;
const ERR_INVALID_PROPOSAL_TYPE = 113;
const ERR_INVALID_EXECUTOR = 114;
const ERR_MAX_PROPOSALS_EXCEEDED = 115;
const ERR_INVALID_DEPOSIT = 116;
const ERR_INVALID_START_TIME = 117;
const ERR_INVALID_END_TIME = 118;
const ERR_INVALID_TARGET_CONTRACT = 119;
const ERR_EXECUTION_FAILED = 120;

interface Proposal {
  description: string;
  proposer: string;
  startTime: number;
  endTime: number;
  votesFor: number;
  votesAgainst: number;
  executed: boolean;
  proposalType: string;
  targetContract: string | null;
  quorumMet: boolean;
  thresholdMet: boolean;
  depositReturned: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class GovernanceMock {
  state: {
    nextProposalId: number;
    maxProposals: number;
    minVotingPeriod: number;
    maxVotingPeriod: number;
    quorumPercentage: number;
    thresholdPercentage: number;
    timelockBlocks: number;
    proposalDeposit: number;
    tokenContract: string;
    totalSupply: number;
    proposals: Map<number, Proposal>;
    proposalVotes: Map<string, number>;
  } = {
    nextProposalId: 0,
    maxProposals: 1000,
    minVotingPeriod: 144,
    maxVotingPeriod: 10080,
    quorumPercentage: 20,
    thresholdPercentage: 51,
    timelockBlocks: 144,
    proposalDeposit: 1000,
    tokenContract: "SP000000000000000000002Q6VF78",
    totalSupply: 0,
    proposals: new Map(),
    proposalVotes: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  balances: Map<string, number> = new Map([["ST1TEST", 100000]]);
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  contractCaller: string = "ST1CONTRACT";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextProposalId: 0,
      maxProposals: 1000,
      minVotingPeriod: 144,
      maxVotingPeriod: 10080,
      quorumPercentage: 20,
      thresholdPercentage: 51,
      timelockBlocks: 144,
      proposalDeposit: 1000,
      tokenContract: "SP000000000000000000002Q6VF78",
      totalSupply: 0,
      proposals: new Map(),
      proposalVotes: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.balances = new Map([["ST1TEST", 100000]]);
    this.stxTransfers = [];
    this.contractCaller = "ST1CONTRACT";
  }

  getBalance(account: string): Result<number> {
    const balance = this.balances.get(account) ?? 0;
    return { ok: true, value: balance };
  }

  setTokenContract(newContract: string): Result<boolean> {
    if (this.caller !== this.contractCaller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.tokenContract = newContract;
    return { ok: true, value: true };
  }

  updateTotalSupply(newSupply: number): Result<boolean> {
    if (this.caller !== this.state.tokenContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.totalSupply = newSupply;
    return { ok: true, value: true };
  }

  setQuorumPercentage(newQuorum: number): Result<boolean> {
    if (this.caller !== this.contractCaller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newQuorum < 10 || newQuorum > 50) return { ok: false, value: ERR_INVALID_QUORUM };
    this.state.quorumPercentage = newQuorum;
    return { ok: true, value: true };
  }

  setThresholdPercentage(newThreshold: number): Result<boolean> {
    if (this.caller !== this.contractCaller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newThreshold < 51 || newThreshold > 100) return { ok: false, value: ERR_INVALID_THRESHOLD };
    this.state.thresholdPercentage = newThreshold;
    return { ok: true, value: true };
  }

  setTimelockBlocks(newTimelock: number): Result<boolean> {
    if (this.caller !== this.contractCaller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newTimelock <= 0) return { ok: false, value: ERR_INVALID_VOTING_PERIOD };
    this.state.timelockBlocks = newTimelock;
    return { ok: true, value: true };
  }

  setProposalDeposit(newDeposit: number): Result<boolean> {
    if (this.caller !== this.contractCaller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.proposalDeposit = newDeposit;
    return { ok: true, value: true };
  }

  submitProposal(
    description: string,
    startTime: number,
    endTime: number,
    ptype: string,
    target: string | null
  ): Result<number> {
    const id = this.state.nextProposalId;
    if (id >= this.state.maxProposals) return { ok: false, value: ERR_MAX_PROPOSALS_EXCEEDED };
    if (!description || description.length > 500) return { ok: false, value: ERR_INVALID_PROPOSAL_DESCRIPTION };
    if (endTime <= startTime || (endTime - startTime) < this.state.minVotingPeriod || (endTime - startTime) > this.state.maxVotingPeriod) {
      return { ok: false, value: ERR_INVALID_VOTING_PERIOD };
    }
    if (!["governance", "funding", "upgrade"].includes(ptype)) return { ok: false, value: ERR_INVALID_PROPOSAL_TYPE };
    if (startTime < this.blockHeight) return { ok: false, value: ERR_INVALID_START_TIME };
    if (endTime <= this.blockHeight) return { ok: false, value: ERR_INVALID_END_TIME };
    if (target && target === this.caller) return { ok: false, value: ERR_INVALID_TARGET_CONTRACT };
    const balance = this.getBalance(this.caller).value;
    if (balance <= 0) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.stxTransfers.push({ amount: this.state.proposalDeposit, from: this.caller, to: "contract" });
    const proposal: Proposal = {
      description,
      proposer: this.caller,
      startTime,
      endTime,
      votesFor: 0,
      votesAgainst: 0,
      executed: false,
      proposalType: ptype,
      targetContract: target,
      quorumMet: false,
      thresholdMet: false,
      depositReturned: false,
    };
    this.state.proposals.set(id, proposal);
    this.state.nextProposalId++;
    return { ok: true, value: id };
  }

  voteOnProposal(id: number, amount: number, support: boolean): Result<boolean> {
    const proposal = this.state.proposals.get(id);
    if (!proposal) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (this.blockHeight < proposal.startTime || this.blockHeight >= proposal.endTime) return { ok: false, value: ERR_VOTING_CLOSED };
    const voteKey = `${id}-${this.caller}`;
    const currentVote = this.state.proposalVotes.get(voteKey) ?? 0;
    if (currentVote > 0) return { ok: false, value: ERR_ALREADY_VOTED };
    const balance = this.getBalance(this.caller).value;
    if (amount > balance) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    if (support) {
      proposal.votesFor += amount;
    } else {
      proposal.votesAgainst += amount;
    }
    this.state.proposalVotes.set(voteKey, amount);
    this.state.proposals.set(id, proposal);
    return { ok: true, value: true };
  }

  executeProposal(id: number): Result<boolean> {
    const proposal = this.state.proposals.get(id);
    if (!proposal) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (this.blockHeight < proposal.endTime) return { ok: false, value: ERR_VOTING_CLOSED };
    if (proposal.executed) return { ok: false, value: ERR_PROPOSAL_EXECUTED };
    const totalVotes = proposal.votesFor + proposal.votesAgainst;
    const quorumRequired = (this.state.totalSupply * this.state.quorumPercentage) / 100;
    if (totalVotes < quorumRequired) return { ok: false, value: ERR_INVALID_QUORUM };
    const thresholdRequired = (totalVotes * this.state.thresholdPercentage) / 100;
    if (proposal.votesFor < thresholdRequired) return { ok: false, value: ERR_PROPOSAL_NOT_PASSED };
    if (this.blockHeight < proposal.endTime + this.state.timelockBlocks) return { ok: false, value: ERR_TIMELOCK_NOT_EXPIRED };
    proposal.executed = true;
    proposal.quorumMet = true;
    proposal.thresholdMet = true;
    this.state.proposals.set(id, proposal);
    if (!proposal.depositReturned) {
      this.stxTransfers.push({ amount: this.state.proposalDeposit, from: "contract", to: proposal.proposer });
      proposal.depositReturned = true;
    }
    return { ok: true, value: true };
  }

  cancelProposal(id: number): Result<boolean> {
    const proposal = this.state.proposals.get(id);
    if (!proposal) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (this.caller !== proposal.proposer) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.blockHeight >= proposal.startTime) return { ok: false, value: ERR_VOTING_CLOSED };
    this.state.proposals.delete(id);
    this.stxTransfers.push({ amount: this.state.proposalDeposit, from: "contract", to: proposal.proposer });
    return { ok: true, value: true };
  }

  getProposalStatus(id: number): Result<string> {
    const proposal = this.state.proposals.get(id);
    if (!proposal) return { ok: false, value: "" };
    if (proposal.executed) return { ok: true, value: "executed" };
    if (this.blockHeight >= proposal.endTime) {
      const totalVotes = proposal.votesFor + proposal.votesAgainst;
      const quorumRequired = (this.state.totalSupply * this.state.quorumPercentage) / 100;
      const thresholdRequired = (totalVotes * this.state.thresholdPercentage) / 100;
      if (totalVotes >= quorumRequired && proposal.votesFor >= thresholdRequired) {
        return { ok: true, value: "passed" };
      } else {
        return { ok: true, value: "failed" };
      }
    }
    return { ok: true, value: "active" };
  }
}

describe("Governance Contract", () => {
  let contract: GovernanceMock;

  beforeEach(() => {
    contract = new GovernanceMock();
    contract.reset();
    contract.state.totalSupply = 100000;
  });

  it("submits a proposal successfully", () => {
    const result = contract.submitProposal("Test Proposal", 0, 200, "governance", null);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const proposal = contract.state.proposals.get(0);
    expect(proposal?.description).toBe("Test Proposal");
    expect(proposal?.startTime).toBe(0);
    expect(proposal?.endTime).toBe(200);
    expect(proposal?.proposalType).toBe("governance");
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "contract" }]);
  });

  it("rejects proposal with invalid description", () => {
    const longDesc = "a".repeat(501);
    const result = contract.submitProposal(longDesc, 0, 200, "governance", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPOSAL_DESCRIPTION);
  });

  it("rejects proposal with invalid voting period", () => {
    const result = contract.submitProposal("Test", 0, 143, "governance", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VOTING_PERIOD);
  });

  it("rejects proposal with invalid type", () => {
    const result = contract.submitProposal("Test", 0, 200, "invalid", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPOSAL_TYPE);
  });

  it("votes on proposal successfully", () => {
    contract.submitProposal("Test", 0, 200, "governance", null);
    contract.blockHeight = 50;
    const result = contract.voteOnProposal(0, 5000, true);
    expect(result.ok).toBe(true);
    const proposal = contract.state.proposals.get(0);
    expect(proposal?.votesFor).toBe(5000);
  });

  it("rejects vote when already voted", () => {
    contract.submitProposal("Test", 0, 200, "governance", null);
    contract.blockHeight = 50;
    contract.voteOnProposal(0, 5000, true);
    const result = contract.voteOnProposal(0, 1000, false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_VOTED);
  });

  it("rejects vote with insufficient balance", () => {
    contract.submitProposal("Test", 0, 200, "governance", null);
    contract.blockHeight = 50;
    const result = contract.voteOnProposal(0, 150000, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("executes proposal successfully", () => {
    contract.submitProposal("Test", 0, 200, "governance", null);
    contract.blockHeight = 50;
    contract.voteOnProposal(0, 30000, true);
    contract.blockHeight = 200 + 144;
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(true);
    const proposal = contract.state.proposals.get(0);
    expect(proposal?.executed).toBe(true);
    expect(contract.stxTransfers[1]).toEqual({ amount: 1000, from: "contract", to: "ST1TEST" });
  });

  it("rejects execution before timelock", () => {
    contract.submitProposal("Test", 0, 200, "governance", null);
    contract.blockHeight = 50;
    contract.voteOnProposal(0, 30000, true);
    contract.blockHeight = 200;
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TIMELOCK_NOT_EXPIRED);
  });

  it("rejects execution if not passed", () => {
    contract.submitProposal("Test", 0, 200, "governance", null);
    contract.blockHeight = 50;
    contract.voteOnProposal(0, 10000, true);
    contract.caller = "ST2TEST";
    contract.balances.set("ST2TEST", 100000);
    contract.voteOnProposal(0, 10000, false);
    contract.caller = "ST1TEST";
    contract.blockHeight = 200 + 144;
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROPOSAL_NOT_PASSED);
  });

  it("cancels proposal successfully", () => {
    contract.submitProposal("Test", 10, 200, "governance", null);
    contract.blockHeight = 5;
    const result = contract.cancelProposal(0);
    expect(result.ok).toBe(true);
    expect(contract.state.proposals.has(0)).toBe(false);
    expect(contract.stxTransfers[1]).toEqual({ amount: 1000, from: "contract", to: "ST1TEST" });
  });

  it("rejects cancel after start time", () => {
    contract.submitProposal("Test", 10, 200, "governance", null);
    contract.blockHeight = 10;
    const result = contract.cancelProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VOTING_CLOSED);
  });

  it("gets proposal status correctly", () => {
    contract.submitProposal("Test", 0, 200, "governance", null);
    contract.blockHeight = 50;
    let result = contract.getProposalStatus(0);
    expect(result.value).toBe("active");
    contract.voteOnProposal(0, 30000, true);
    contract.blockHeight = 200 + 144;
    result = contract.getProposalStatus(0);
    expect(result.value).toBe("passed");
    contract.executeProposal(0);
    result = contract.getProposalStatus(0);
    expect(result.value).toBe("executed");
  });

  it("sets quorum percentage successfully", () => {
    contract.caller = contract.contractCaller;
    const result = contract.setQuorumPercentage(25);
    expect(result.ok).toBe(true);
    expect(contract.state.quorumPercentage).toBe(25);
  });

  it("rejects invalid quorum", () => {
    contract.caller = contract.contractCaller;
    const result = contract.setQuorumPercentage(5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_QUORUM);
  });
});