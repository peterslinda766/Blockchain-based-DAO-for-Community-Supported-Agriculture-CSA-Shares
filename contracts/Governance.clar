(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PROPOSAL-DESCRIPTION u101)
(define-constant ERR-INVALID-VOTING-PERIOD u102)
(define-constant ERR-INVALID-QUORUM u103)
(define-constant ERR-INVALID-THRESHOLD u104)
(define-constant ERR-PROPOSAL-ALREADY-EXISTS u105)
(define-constant ERR-PROPOSAL-NOT-FOUND u106)
(define-constant ERR-VOTING-CLOSED u107)
(define-constant ERR-INSUFFICIENT-BALANCE u108)
(define-constant ERR-ALREADY-VOTED u109)
(define-constant ERR-PROPOSAL-EXECUTED u110)
(define-constant ERR-PROPOSAL-NOT-PASSED u111)
(define-constant ERR-TIMELOCK-NOT-EXPIRED u112)
(define-constant ERR-INVALID-PROPOSAL-TYPE u113)
(define-constant ERR-INVALID-EXECUTOR u114)
(define-constant ERR-MAX-PROPOSALS-EXCEEDED u115)
(define-constant ERR-INVALID-DEPOSIT u116)
(define-constant ERR-INVALID-START-TIME u117)
(define-constant ERR-INVALID-END-TIME u118)
(define-constant ERR-INVALID-TARGET-CONTRACT u119)
(define-constant ERR-EXECUTION-FAILED u120)

(define-data-var next-proposal-id uint u0)
(define-data-var max-proposals uint u1000)
(define-data-var min-voting-period uint u144)
(define-data-var max-voting-period uint u10080)
(define-data-var quorum-percentage uint u20)
(define-data-var threshold-percentage uint u51)
(define-data-var timelock-blocks uint u144)
(define-data-var proposal-deposit uint u1000)
(define-data-var token-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var total-supply uint u0)

(define-map proposals
  uint
  {
    description: (string-utf8 500),
    proposer: principal,
    start-time: uint,
    end-time: uint,
    votes-for: uint,
    votes-against: uint,
    executed: bool,
    proposal-type: (string-ascii 20),
    target-contract: (optional principal),
    quorum-met: bool,
    threshold-met: bool,
    deposit-returned: bool
  }
)

(define-map proposal-votes
  { proposal-id: uint, voter: principal }
  uint
)

(define-map proposal-types
  (string-ascii 20)
  bool
)

(define-read-only (get-proposal (id uint))
  (map-get? proposals id)
)

(define-read-only (get-vote (id uint) (voter principal))
  (map-get? proposal-votes { proposal-id: id, voter: voter })
)

(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

(define-read-only (get-balance (account principal))
  (contract-call? .csa-token get-balance account)
)

(define-private (validate-description (desc (string-utf8 500)))
  (if (and (> (len desc) u0) (<= (len desc) u500))
    (ok true)
    (err ERR-INVALID-PROPOSAL-DESCRIPTION))
)

(define-private (validate-voting-period (start uint) (end uint))
  (if (and (> end start)
           (>= (- end start) (var-get min-voting-period))
           (<= (- end start) (var-get max-voting-period)))
    (ok true)
    (err ERR-INVALID-VOTING-PERIOD))
)

(define-private (validate-quorum (quorum uint))
  (if (and (>= quorum u10) (<= quorum u50))
    (ok true)
    (err ERR-INVALID-QUORUM))
)

(define-private (validate-threshold (threshold uint))
  (if (and (>= threshold u51) (<= threshold u100))
    (ok true)
    (err ERR-INVALID-THRESHOLD))
)

(define-private (validate-proposal-type (ptype (string-ascii 20)))
  (if (or (is-eq ptype "governance") (is-eq ptype "funding") (is-eq ptype "upgrade"))
    (ok true)
    (err ERR-INVALID-PROPOSAL-TYPE))
)

(define-private (validate-deposit (deposit uint))
  (if (>= deposit (var-get proposal-deposit))
    (ok true)
    (err ERR-INVALID-DEPOSIT))
)

(define-private (validate-start-time (start uint))
  (if (>= start block-height)
    (ok true)
    (err ERR-INVALID-START-TIME))
)

(define-private (validate-end-time (end uint))
  (if (> end block-height)
    (ok true)
    (err ERR-INVALID-END-TIME))
)

(define-private (validate-target-contract (target (optional principal)))
  (match target
    p (if (not (is-eq p tx-sender))
        (ok true)
        (err ERR-INVALID-TARGET-CONTRACT))
    (ok true))
)

(define-public (set-token-contract (new-contract principal))
  (begin
    (asserts! (is-eq tx-sender contract-caller) (err ERR-NOT-AUTHORIZED))
    (var-set token-contract new-contract)
    (ok true)
  )
)

(define-public (update-total-supply (new-supply uint))
  (begin
    (asserts! (is-eq tx-sender (var-get token-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set total-supply new-supply)
    (ok true)
  )
)

(define-public (set-quorum-percentage (new-quorum uint))
  (begin
    (asserts! (is-eq tx-sender contract-caller) (err ERR-NOT-AUTHORIZED))
    (try! (validate-quorum new-quorum))
    (var-set quorum-percentage new-quorum)
    (ok true)
  )
)

(define-public (set-threshold-percentage (new-threshold uint))
  (begin
    (asserts! (is-eq tx-sender contract-caller) (err ERR-NOT-AUTHORIZED))
    (try! (validate-threshold new-threshold))
    (var-set threshold-percentage new-threshold)
    (ok true)
  )
)

(define-public (set-timelock-blocks (new-timelock uint))
  (begin
    (asserts! (is-eq tx-sender contract-caller) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-timelock u0) (err ERR-INVALID-VOTING-PERIOD))
    (var-set timelock-blocks new-timelock)
    (ok true)
  )
)

(define-public (set-proposal-deposit (new-deposit uint))
  (begin
    (asserts! (is-eq tx-sender contract-caller) (err ERR-NOT-AUTHORIZED))
    (var-set proposal-deposit new-deposit)
    (ok true)
  )
)

(define-public (submit-proposal
  (description (string-utf8 500))
  (start-time uint)
  (end-time uint)
  (ptype (string-ascii 20))
  (target (optional principal))
  )
  (let ((id (var-get next-proposal-id))
        (balance (unwrap! (get-balance tx-sender) (err ERR-INSUFFICIENT-BALANCE))))
    (asserts! (< id (var-get max-proposals)) (err ERR-MAX-PROPOSALS-EXCEEDED))
    (try! (validate-description description))
    (try! (validate-voting-period start-time end-time))
    (try! (validate-proposal-type ptype))
    (try! (validate-start-time start-time))
    (try! (validate-end-time end-time))
    (try! (validate-target-contract target))
    (asserts! (> balance u0) (err ERR-INSUFFICIENT-BALANCE))
    (try! (stx-transfer? (var-get proposal-deposit) tx-sender (as-contract tx-sender)))
    (map-set proposals id
      {
        description: description,
        proposer: tx-sender,
        start-time: start-time,
        end-time: end-time,
        votes-for: u0,
        votes-against: u0,
        executed: false,
        proposal-type: ptype,
        target-contract: target,
        quorum-met: false,
        threshold-met: false,
        deposit-returned: false
      }
    )
    (var-set next-proposal-id (+ id u1))
    (print { event: "proposal-submitted", id: id })
    (ok id)
  )
)

(define-public (vote-on-proposal (id uint) (amount uint) (support bool))
  (let ((proposal (unwrap! (map-get? proposals id) (err ERR-PROPOSAL-NOT-FOUND)))
        (balance (unwrap! (get-balance tx-sender) (err ERR-INSUFFICIENT-BALANCE)))
        (current-vote (default-to u0 (map-get? proposal-votes { proposal-id: id, voter: tx-sender }))))
    (asserts! (>= block-height (get start-time proposal)) (err ERR-VOTING-CLOSED))
    (asserts! (< block-height (get end-time proposal)) (err ERR-VOTING-CLOSED))
    (asserts! (is-eq current-vote u0) (err ERR-ALREADY-VOTED))
    (asserts! (<= amount balance) (err ERR-INSUFFICIENT-BALANCE))
    (if support
      (map-set proposals id (merge proposal { votes-for: (+ (get votes-for proposal) amount) }))
      (map-set proposals id (merge proposal { votes-against: (+ (get votes-against proposal) amount) }))
    )
    (map-set proposal-votes { proposal-id: id, voter: tx-sender } amount)
    (print { event: "vote-cast", id: id, voter: tx-sender, amount: amount, support: support })
    (ok true)
  )
)

(define-public (execute-proposal (id uint))
  (let ((proposal (unwrap! (map-get? proposals id) (err ERR-PROPOSAL-NOT-FOUND)))
        (total-votes (+ (get votes-for proposal) (get votes-against proposal)))
        (quorum-required (/ (* (var-get total-supply) (var-get quorum-percentage)) u100))
        (threshold-required (/ (* total-votes (var-get threshold-percentage)) u100)))
    (asserts! (>= block-height (get end-time proposal)) (err ERR-VOTING-CLOSED))
    (asserts! (not (get executed proposal)) (err ERR-PROPOSAL-EXECUTED))
    (asserts! (>= total-votes quorum-required) (err ERR-INVALID-QUORUM))
    (asserts! (>= (get votes-for proposal) threshold-required) (err ERR-PROPOSAL-NOT-PASSED))
    (asserts! (>= block-height (+ (get end-time proposal) (var-get timelock-blocks))) (err ERR-TIMELOCK-NOT-EXPIRED))
    (map-set proposals id (merge proposal { executed: true, quorum-met: true, threshold-met: true }))
    (match (get target-contract proposal)
      target-contract
        (try! (contract-call? target-contract execute-proposal-action id))
      true
    )
    (if (not (get deposit-returned proposal))
      (begin
        (try! (as-contract (stx-transfer? (var-get proposal-deposit) tx-sender (get proposer proposal))))
        (map-set proposals id (merge proposal { deposit-returned: true }))
      )
      true
    )
    (print { event: "proposal-executed", id: id })
    (ok true)
  )
)

(define-public (cancel-proposal (id uint))
  (let ((proposal (unwrap! (map-get? proposals id) (err ERR-PROPOSAL-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get proposer proposal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (< block-height (get start-time proposal)) (err ERR-VOTING-CLOSED))
    (map-delete proposals id)
    (try! (as-contract (stx-transfer? (var-get proposal-deposit) tx-sender (get proposer proposal))))
    (print { event: "proposal-cancelled", id: id })
    (ok true)
  )
)

(define-read-only (get-proposal-status (id uint))
  (let ((proposal (unwrap! (map-get? proposals id) (err ERR-PROPOSAL-NOT-FOUND))))
    (if (get executed proposal)
      (ok "executed")
      (if (>= block-height (get end-time proposal))
        (if (and (>= (+ (get votes-for proposal) (get votes-against proposal)) (/ (* (var-get total-supply) (var-get quorum-percentage)) u100))
                 (>= (get votes-for proposal) (/ (* (+ (get votes-for proposal) (get votes-against proposal)) (var-get threshold-percentage)) u100)))
          (ok "passed")
          (ok "failed"))
        (ok "active"))))
)