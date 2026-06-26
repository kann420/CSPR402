require('../helpers/env');

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { PublicKey } = require('casper-js-sdk');
const {
  CasperPaymentVerificationError,
  verifyCasperCep18Payment,
  verifyCasperDeployPayment,
  _extractCep18Transfer,
  _extractLegacyDeployTransfer,
  _executionStatus,
} = require('../../src/payments/casper-verify');

const DEPLOY_HASH = 'a'.repeat(64);
const SENDER = '01' + 'b'.repeat(64);
const RECIPIENT = '01' + 'a'.repeat(64);
const PACKAGE_HASH = 'f'.repeat(64);
const RECIPIENT_ACCOUNT_HASH = PublicKey.fromHex(RECIPIENT)
  .accountHash()
  .toPrefixedString()
  .toLowerCase();

function u256Bytes(value) {
  let hex = BigInt(value).toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  const bytes = hex.match(/../g)?.reverse().join('') || '00';
  const len = (bytes.length / 2).toString(16).padStart(2, '0');
  return `${len}${bytes}`;
}

function deployValue({
  hash = DEPLOY_HASH,
  chainName = 'casper-test',
  amount = '1000000000000',
  recipient = RECIPIENT,
  transferId = 100000,
  errorMessage = null,
} = {}) {
  return {
    api_version: '2.0.0',
    deploy: {
      hash,
      header: {
        account: SENDER,
        chain_name: chainName,
      },
      session: {
        Transfer: {
          args: [
            ['amount', { cl_type: 'U512', parsed: amount }],
            ['target', { cl_type: 'PublicKey', parsed: recipient }],
            ['id', { cl_type: { Option: 'U64' }, parsed: transferId }],
          ],
        },
      },
    },
    execution_info: {
      block_hash: 'c'.repeat(64),
      block_height: 123,
      execution_result: {
        Version2: {
          initiator: { PublicKey: SENDER },
          error_message: errorMessage,
          cost: '2500000000',
        },
      },
    },
  };
}

function transactionValue({
  hash = DEPLOY_HASH,
  chainName = 'casper-test',
  amount = '1000000000000',
  transferId = 100000,
  recipientAccountHash = RECIPIENT_ACCOUNT_HASH,
  errorMessage = null,
} = {}) {
  return {
    api_version: '2.0.0',
    transaction: {
      Version1: {
        hash,
        header: {
          chain_name: chainName,
          initiator_addr: { PublicKey: SENDER },
        },
        body: {
          entry_point: 'Transfer',
          args: [
            ['amount', { cl_type: 'U512', parsed: amount }],
            ['target', { cl_type: 'URef', parsed: 'uref-' + 'd'.repeat(64) + '-004' }],
            ['id', { cl_type: { Option: 'U64' }, parsed: transferId }],
          ],
        },
      },
    },
    execution_info: {
      block_hash: 'c'.repeat(64),
      block_height: 123,
      execution_result: {
        Version2: {
          initiator: { PublicKey: SENDER },
          error_message: errorMessage,
          cost: '2500000000',
          transfers: [
            {
              Version2: {
                transaction_hash: { Deploy: hash },
                to: recipientAccountHash,
                target: 'uref-' + 'd'.repeat(64) + '-004',
                amount,
                id: transferId,
              },
            },
          ],
        },
      },
    },
  };
}

function cep18TransactionValue({
  hash = DEPLOY_HASH,
  chainName = 'casper-test',
  amount = '10000000',
  packageHash = PACKAGE_HASH,
  recipientAccountHash = RECIPIENT_ACCOUNT_HASH,
  sender = SENDER,
  entryPoint = { Custom: 'transfer' },
  errorMessage = null,
} = {}) {
  return {
    api_version: '2.0.0',
    transaction: {
      Version1: {
        hash,
        payload: {
          initiator_addr: { PublicKey: sender },
          chain_name: chainName,
          fields: {
            entry_point: entryPoint,
            target: {
              Stored: {
                id: {
                  ByPackageHash: {
                    addr: packageHash,
                  },
                },
              },
            },
            args: {
              Named: [
                [
                  'recipient',
                  {
                    bytes: `00${recipientAccountHash.replace('account-hash-', '')}`,
                    cl_type: 'Key',
                  },
                ],
                ['amount', { bytes: u256Bytes(amount), cl_type: 'U256' }],
              ],
            },
          },
        },
      },
    },
    execution_info: {
      block_hash: 'c'.repeat(64),
      block_height: 123,
      execution_result: {
        Version2: {
          initiator: { PublicKey: sender },
          error_message: errorMessage,
          cost: '2500000000',
        },
      },
    },
  };
}

describe('Casper deploy verification helpers', () => {
  it('extracts native transfer args from a legacy deploy', () => {
    const transfer = _extractLegacyDeployTransfer(deployValue().deploy);
    assert.equal(transfer.amountMotes, '1000000000000');
    assert.equal(transfer.recipient, RECIPIENT);
    assert.equal(transfer.transferId, 100000);
  });

  it('detects execution success and failure', () => {
    assert.equal(_executionStatus(deployValue().execution_info).state, 'success');
    assert.equal(
      _executionStatus(deployValue({ errorMessage: 'User error' }).execution_info).state,
      'failed',
    );
  });

  it('extracts CEP-18 transfer args from transaction bytes', () => {
    const transfer = _extractCep18Transfer(cep18TransactionValue().transaction);
    assert.equal(transfer.entryPoint, 'transfer');
    assert.equal(transfer.contractPackageHash, PACKAGE_HASH);
    assert.equal(transfer.recipientAccountHash, RECIPIENT_ACCOUNT_HASH);
    assert.equal(transfer.amountBaseUnits, '10000000');
  });
});

describe('verifyCasperDeployPayment', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: transactionValue(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns a verified receipt shape on the happy path', async () => {
    const result = await verifyCasperDeployPayment({
      deployHash: DEPLOY_HASH,
      expectedChainName: 'casper-test',
      expectedRecipient: RECIPIENT,
      expectedAmountMotes: '1000000000000',
      expectedTransferId: 100000,
    });
    assert.equal(result.deployHash, DEPLOY_HASH);
    assert.equal(result.senderPublicKey, SENDER);
    assert.equal(result.amountMotes, '1000000000000');
    assert.equal(result.transferId, 100000);
  });

  it('falls back to info_get_deploy when transaction lookup misses a legacy deploy', async () => {
    global.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.method === 'info_get_transaction') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32014, message: 'No such transaction' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: deployValue(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await verifyCasperDeployPayment({
      deployHash: DEPLOY_HASH,
      expectedChainName: 'casper-test',
      expectedRecipient: RECIPIENT,
      expectedAmountMotes: '1000000000000',
      expectedTransferId: 100000,
    });
    assert.equal(result.deployHash, DEPLOY_HASH);
    assert.equal(result.recipient, RECIPIENT);
  });

  it('rejects wrong recipient', async () => {
    await assert.rejects(
      () =>
        verifyCasperDeployPayment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedRecipient: '01' + 'd'.repeat(64),
          expectedAmountMotes: '1000000000000',
          expectedTransferId: 100000,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'wrong_recipient',
    );
  });

  it('rejects underpayment', async () => {
    await assert.rejects(
      () =>
        verifyCasperDeployPayment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedRecipient: RECIPIENT,
          expectedAmountMotes: '1000000000001',
          expectedTransferId: 100000,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'underpaid',
    );
  });

  it('rejects wrong recipient from a transaction transfer record', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: transactionValue({
            recipientAccountHash: 'account-hash-' + 'd'.repeat(64),
          }),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    await assert.rejects(
      () =>
        verifyCasperDeployPayment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedRecipient: RECIPIENT,
          expectedAmountMotes: '1000000000000',
          expectedTransferId: 100000,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'wrong_recipient',
    );
  });

  it('rejects wrong sender when the expected payer is known', async () => {
    await assert.rejects(
      () =>
        verifyCasperDeployPayment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedRecipient: RECIPIENT,
          expectedAmountMotes: '1000000000000',
          expectedTransferId: 100000,
          expectedSender: '01' + 'c'.repeat(64),
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'wrong_sender',
    );
  });

  it('does not fall back to purse lookup when the execution transfer already has a wrong account hash', async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            name: 'info_get_transaction_result',
            value: transactionValue({
              recipientAccountHash: 'account-hash-' + 'd'.repeat(64),
            }),
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    await assert.rejects(
      () =>
        verifyCasperDeployPayment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedRecipient: RECIPIENT,
          expectedAmountMotes: '1000000000000',
          expectedTransferId: 100000,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'wrong_recipient',
    );
    assert.equal(fetchCalls, 1);
  });

  it('maps missing execution info to payment_pending', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { ...transactionValue(), execution_info: null },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    await assert.rejects(
      () =>
        verifyCasperDeployPayment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedRecipient: RECIPIENT,
          expectedAmountMotes: '1000000000000',
          expectedTransferId: 100000,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'payment_pending',
    );
  });
});

describe('verifyCasperCep18Payment', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: cep18TransactionValue(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns a verified mockUSDC receipt shape on the happy path', async () => {
    const result = await verifyCasperCep18Payment({
      deployHash: DEPLOY_HASH,
      expectedChainName: 'casper-test',
      expectedContractPackageHash: PACKAGE_HASH,
      expectedRecipient: RECIPIENT,
      expectedAmountBaseUnits: '10000000',
      expectedSender: SENDER,
    });
    assert.equal(result.deployHash, DEPLOY_HASH);
    assert.equal(result.senderPublicKey, SENDER);
    assert.equal(result.contractPackageHash, PACKAGE_HASH);
    assert.equal(result.recipientAccountHash, RECIPIENT_ACCOUNT_HASH);
    assert.equal(result.amountBaseUnits, '10000000');
  });

  it('rejects wrong package hash', async () => {
    await assert.rejects(
      () =>
        verifyCasperCep18Payment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedContractPackageHash: 'e'.repeat(64),
          expectedRecipient: RECIPIENT,
          expectedAmountBaseUnits: '10000000',
          expectedSender: SENDER,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'wrong_contract',
    );
  });

  it('rejects wrong entry point', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: cep18TransactionValue({ entryPoint: { Custom: 'approve' } }),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    await assert.rejects(
      () =>
        verifyCasperCep18Payment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedContractPackageHash: PACKAGE_HASH,
          expectedRecipient: RECIPIENT,
          expectedAmountBaseUnits: '10000000',
          expectedSender: SENDER,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'not_cep18_transfer',
    );
  });

  it('rejects wrong sender, recipient, underpayment, failed, and pending deploys', async () => {
    await assert.rejects(
      () =>
        verifyCasperCep18Payment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedContractPackageHash: PACKAGE_HASH,
          expectedRecipient: RECIPIENT,
          expectedAmountBaseUnits: '10000000',
          expectedSender: '01' + 'c'.repeat(64),
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'wrong_sender',
    );

    await assert.rejects(
      () =>
        verifyCasperCep18Payment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedContractPackageHash: PACKAGE_HASH,
          expectedRecipient: '01' + 'd'.repeat(64),
          expectedAmountBaseUnits: '10000000',
          expectedSender: SENDER,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'wrong_recipient',
    );

    await assert.rejects(
      () =>
        verifyCasperCep18Payment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedContractPackageHash: PACKAGE_HASH,
          expectedRecipient: RECIPIENT,
          expectedAmountBaseUnits: '10000001',
          expectedSender: SENDER,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'underpaid',
    );

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: cep18TransactionValue({ errorMessage: 'CEP-18 reverted' }),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    await assert.rejects(
      () =>
        verifyCasperCep18Payment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedContractPackageHash: PACKAGE_HASH,
          expectedRecipient: RECIPIENT,
          expectedAmountBaseUnits: '10000000',
          expectedSender: SENDER,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'execution_failed',
    );

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { ...cep18TransactionValue(), execution_info: null },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    await assert.rejects(
      () =>
        verifyCasperCep18Payment({
          deployHash: DEPLOY_HASH,
          expectedChainName: 'casper-test',
          expectedContractPackageHash: PACKAGE_HASH,
          expectedRecipient: RECIPIENT,
          expectedAmountBaseUnits: '10000000',
          expectedSender: SENDER,
        }),
      (err) => err instanceof CasperPaymentVerificationError && err.code === 'payment_pending',
    );
  });
});
