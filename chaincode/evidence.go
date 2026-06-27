package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/pkg/cid"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// EvidenceContract contract for managing evidence custody
type EvidenceContract struct {
	contractapi.Contract
}

// Evidence defines the structure of an evidence record
type Evidence struct {
	EvidenceID string `json:"evidenceId"`
	CaseID     string `json:"caseId"`
	OfficerID  string `json:"officerId"`
	IpfsCID    string `json:"ipfsCID"`
	Sha256Hash string `json:"sha256Hash"`
	Timestamp  string `json:"timestamp"`
	FromOrg    string `json:"fromOrg"`
	ToOrg      string `json:"toOrg"`
	Reason     string `json:"reason"`
}

// VerificationResult defines the structure for integrity verification response
type VerificationResult struct {
	Verified   bool   `json:"verified"`
	StoredHash string `json:"storedHash"`
	Timestamp  string `json:"timestamp"`
}

// CustodyHistoryItem defines the structure of a history record returned to client
type CustodyHistoryItem struct {
	TxID      string    `json:"txId"`
	Value     *Evidence `json:"value"`
	Timestamp string    `json:"timestamp"`
	IsDelete  bool      `json:"isDelete"`
}

// RegisterEvidenceEvent represents event payload for EvidenceRegistered
type RegisterEvidenceEvent struct {
	EvidenceID string `json:"evidenceId"`
	CaseID     string `json:"caseId"`
	OfficerID  string `json:"officerId"`
	Timestamp  string `json:"timestamp"`
}

// TransferCustodyEvent represents event payload for CustodyTransferred
type TransferCustodyEvent struct {
	EvidenceID string `json:"evidenceId"`
	FromOrg    string `json:"fromOrg"`
	ToOrg      string `json:"toOrg"`
	Timestamp  string `json:"timestamp"`
}

// RegisterEvidence registers a new evidence item on the ledger
func (c *EvidenceContract) RegisterEvidence(ctx contractapi.TransactionContextInterface, evidenceID string, caseID string, officerID string, ipfsCID string, sha256Hash string, timestamp string) error {
	// Assert dynamic role attributes (officer role required to submit evidence)
	roleValue, found, err := cid.GetAttributeValue(ctx.GetStub(), "evidex.role")
	if err == nil && found {
		if roleValue != "officer" {
			return fmt.Errorf("unauthorized: client certificate role is '%s', must be 'officer' to register evidence", roleValue)
		}
	}

	exists, err := c.EvidenceExists(ctx, evidenceID)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("the evidence %s already exists", evidenceID)
	}

	evidence := Evidence{
		EvidenceID: evidenceID,
		CaseID:     caseID,
		OfficerID:  officerID,
		IpfsCID:    ipfsCID,
		Sha256Hash: sha256Hash,
		Timestamp:  timestamp,
	}

	evidenceBytes, err := json.Marshal(evidence)
	if err != nil {
		return err
	}

	err = ctx.GetStub().PutState(evidenceID, evidenceBytes)
	if err != nil {
		return err
	}

	// Emit Event: EvidenceRegistered
	eventPayload := RegisterEvidenceEvent{
		EvidenceID: evidenceID,
		CaseID:     caseID,
		OfficerID:  officerID,
		Timestamp:  timestamp,
	}
	eventBytes, err := json.Marshal(eventPayload)
	if err == nil {
		_ = ctx.GetStub().SetEvent("EvidenceRegistered", eventBytes)
	}

	return nil
}

// TransferCustody transfers custody of an evidence item to a new organisation
func (c *EvidenceContract) TransferCustody(ctx contractapi.TransactionContextInterface, evidenceID string, fromOrg string, toOrg string, reason string, timestamp string) error {
	// Assert dynamic role attributes (officer or lab role required to transfer custody)
	roleValue, found, err := cid.GetAttributeValue(ctx.GetStub(), "evidex.role")
	if err == nil && found {
		if roleValue != "officer" && roleValue != "lab" {
			return fmt.Errorf("unauthorized: client certificate role is '%s', must be 'officer' or 'lab' to transfer custody", roleValue)
		}
	}

	evidence, err := c.ReadEvidence(ctx, evidenceID)
	if err != nil {
		return err
	}

	// Update transfer details
	evidence.FromOrg = fromOrg
	evidence.ToOrg = toOrg
	evidence.Reason = reason
	evidence.Timestamp = timestamp

	evidenceBytes, err := json.Marshal(evidence)
	if err != nil {
		return err
	}

	err = ctx.GetStub().PutState(evidenceID, evidenceBytes)
	if err != nil {
		return err
	}

	// Emit Event: CustodyTransferred
	eventPayload := TransferCustodyEvent{
		EvidenceID: evidenceID,
		FromOrg:    fromOrg,
		ToOrg:      toOrg,
		Timestamp:  timestamp,
	}
	eventBytes, err := json.Marshal(eventPayload)
	if err == nil {
		_ = ctx.GetStub().SetEvent("CustodyTransferred", eventBytes)
	}

	return nil
}

// VerifyIntegrity compares a provided hash with the stored hash on ledger
func (c *EvidenceContract) VerifyIntegrity(ctx contractapi.TransactionContextInterface, evidenceID string, providedHash string) (*VerificationResult, error) {
	evidence, err := c.ReadEvidence(ctx, evidenceID)
	if err != nil {
		return nil, err
	}

	// Retrieve original registration to get the original hash
	historyIterator, err := ctx.GetStub().GetHistoryForKey(evidenceID)
	if err != nil {
		return nil, err
	}
	defer historyIterator.Close()

	if !historyIterator.HasNext() {
		return nil, fmt.Errorf("no history found for evidence %s", evidenceID)
	}

	firstModification, err := historyIterator.Next()
	if err != nil {
		return nil, err
	}

	var originalEvidence Evidence
	err = json.Unmarshal(firstModification.Value, &originalEvidence)
	if err != nil {
		return nil, err
	}

	return &VerificationResult{
		Verified:   originalEvidence.Sha256Hash == providedHash,
		StoredHash: originalEvidence.Sha256Hash,
		Timestamp:  evidence.Timestamp,
	}, nil
}

// GetEvidenceHistory returns the full transaction history of custody transfers for an evidence item
func (c *EvidenceContract) GetEvidenceHistory(ctx contractapi.TransactionContextInterface, evidenceID string) ([]CustodyHistoryItem, error) {
	historyIterator, err := ctx.GetStub().GetHistoryForKey(evidenceID)
	if err != nil {
		return nil, err
	}
	defer historyIterator.Close()

	var history []CustodyHistoryItem
	for historyIterator.HasNext() {
		modification, err := historyIterator.Next()
		if err != nil {
			return nil, err
		}

		var evidence Evidence
		if !modification.IsDelete {
			err = json.Unmarshal(modification.Value, &evidence)
			if err != nil {
				return nil, err
			}
		}

		txTimestamp := time.Unix(modification.Timestamp.Seconds, int64(modification.Timestamp.Nanos)).UTC().Format(time.RFC3339)

		historyItem := CustodyHistoryItem{
			TxID:      modification.TxId,
			Value:     &evidence,
			Timestamp: txTimestamp,
			IsDelete:  modification.IsDelete,
		}
		history = append(history, historyItem)
	}

	return history, nil
}

// ReadEvidence retrieves an evidence item from the ledger
func (c *EvidenceContract) ReadEvidence(ctx contractapi.TransactionContextInterface, evidenceID string) (*Evidence, error) {
	evidenceBytes, err := ctx.GetStub().GetState(evidenceID)
	if err != nil {
		return nil, err
	}
	if evidenceBytes == nil {
		return nil, fmt.Errorf("the evidence %s does not exist", evidenceID)
	}

	var evidence Evidence
	err = json.Unmarshal(evidenceBytes, &evidence)
	if err != nil {
		return nil, err
	}

	return &evidence, nil
}

// EvidenceExists returns true if evidence item exists in ledger
func (c *EvidenceContract) EvidenceExists(ctx contractapi.TransactionContextInterface, evidenceID string) (bool, error) {
	evidenceBytes, err := ctx.GetStub().GetState(evidenceID)
	if err != nil {
		return false, err
	}
	return evidenceBytes != nil, nil
}

// ============================================================
// SENTINEL AI — Access Control & Metadata Retrieval
// ============================================================

// AIAccessList defines the list of officers authorized to use the AI analytics layer
type AIAccessList struct {
	AuthorizedOfficers []string `json:"authorizedOfficers"`
}

const aiAccessListKey = "AI_ACCESS_LIST"

// ManageAIAccess adds or removes an officer from the AI access list
// action must be "add" or "remove"
func (c *EvidenceContract) ManageAIAccess(ctx contractapi.TransactionContextInterface, officerID string, action string) error {
	aclBytes, err := ctx.GetStub().GetState(aiAccessListKey)
	if err != nil {
		return fmt.Errorf("failed to read AI access list: %v", err)
	}

	acl := AIAccessList{AuthorizedOfficers: []string{}}
	if aclBytes != nil {
		err = json.Unmarshal(aclBytes, &acl)
		if err != nil {
			return fmt.Errorf("failed to parse AI access list: %v", err)
		}
	}

	switch action {
	case "add":
		// Check if already exists
		for _, id := range acl.AuthorizedOfficers {
			if id == officerID {
				return nil // already authorized
			}
		}
		acl.AuthorizedOfficers = append(acl.AuthorizedOfficers, officerID)
	case "remove":
		filtered := []string{}
		for _, id := range acl.AuthorizedOfficers {
			if id != officerID {
				filtered = append(filtered, id)
			}
		}
		acl.AuthorizedOfficers = filtered
	default:
		return fmt.Errorf("invalid action '%s': must be 'add' or 'remove'", action)
	}

	aclBytes, err = json.Marshal(acl)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(aiAccessListKey, aclBytes)
}

// CheckAIAccess returns true if the officer is authorized to use the AI layer
func (c *EvidenceContract) CheckAIAccess(ctx contractapi.TransactionContextInterface, officerID string) (bool, error) {
	aclBytes, err := ctx.GetStub().GetState(aiAccessListKey)
	if err != nil {
		return false, fmt.Errorf("failed to read AI access list: %v", err)
	}

	if aclBytes == nil {
		return false, nil
	}

	var acl AIAccessList
	err = json.Unmarshal(aclBytes, &acl)
	if err != nil {
		return false, fmt.Errorf("failed to parse AI access list: %v", err)
	}

	for _, id := range acl.AuthorizedOfficers {
		if id == officerID {
			return true, nil
		}
	}
	return false, nil
}

// GetAllEvidence returns metadata of all evidence records (excludes internal keys like ACL)
func (c *EvidenceContract) GetAllEvidence(ctx contractapi.TransactionContextInterface) ([]*Evidence, error) {
	iterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, fmt.Errorf("failed to get state range: %v", err)
	}
	defer iterator.Close()

	var results []*Evidence
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, err
		}

		// Skip internal keys (ACL, etc.)
		if kv.Key == aiAccessListKey {
			continue
		}

		var evidence Evidence
		err = json.Unmarshal(kv.Value, &evidence)
		if err != nil {
			continue // skip non-evidence entries
		}

		// Only include if it has a valid EvidenceID
		if evidence.EvidenceID != "" {
			results = append(results, &evidence)
		}
	}

	return results, nil
}

func main() {
	cc, err := contractapi.NewChaincode(&EvidenceContract{})
	if err != nil {
		panic(fmt.Sprintf("Error creating evidence chaincode: %s", err))
	}

	err = cc.Start()
	if err != nil {
		panic(fmt.Sprintf("Error starting evidence chaincode: %s", err))
	}
}

