import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';
import { MANAGED_BOT_PLANS } from '../../tgcloud/lib/managed-bot-billing-policy.js';

const orderId='mbo_1234567890123456', userId=77, chargeId='telegram-stars-charge-1';
const invoice='managed_bot:v1:monthly:'+orderId;
const message={from:{id:userId},chat:{id:userId,type:'private'},successful_payment:{
  invoice_payload:invoice,total_amount:MANAGED_BOT_PLANS.monthly.amount,currency:'XTR',
  telegram_payment_charge_id:chargeId,
}};
async function fixture({existingPayment=false,paid=false}={}) {
  const h=await harness({extraModules:{billing:'lib/managed-bot-billing'}});
  h.records.managedBotOrders.push({
    orderId,userId,planId:'monthly',amount:MANAGED_BOT_PLANS.monthly.amount,
    currency:'XTR',invoicePayload:invoice,status:paid?'paid':'pending',
  });
  if(existingPayment) h.records.managedBotPayments.push({
    chargeId,orderId,userId,amount:MANAGED_BOT_PLANS.monthly.amount,currency:'XTR',paidAt:Date.now(),
  });
  return h;
}
test('a previously recorded payment with no license is fulfilled on retry',async()=>{
  const h=await fixture({existingPayment:true});
  await h.billing.handleManagedBotSuccessfulPayment(message);
  assert.equal(h.records.managedBotPayments.length,1);
  assert.equal(h.records.managedBotLicenses.length,1);
  assert.equal(h.records.managedBotOrders[0].status,'paid');
  assert.equal(h.records.managedBotLicenses[0].sourcePaymentId,chargeId);
  assert.equal(h.calls.filter(c=>c.method==='sendMessage').length,1);
  await h.billing.handleManagedBotSuccessfulPayment(message);
  assert.equal(h.records.managedBotPayments.length,1);
  assert.equal(h.records.managedBotLicenses.length,1);
  assert.equal(h.calls.filter(c=>c.method==='sendMessage').length,1);
});
test('a paid order missing its license can also be repaired safely',async()=>{
  const h=await fixture({existingPayment:true,paid:true});
  await h.billing.handleManagedBotSuccessfulPayment(message);
  assert.equal(h.records.managedBotLicenses.length,1);
});
test('normal first-time Stars payment creates one durable license',async()=>{
  const h=await fixture();
  await h.billing.handleManagedBotSuccessfulPayment(message);
  assert.equal(h.records.managedBotPayments.length,1);
  assert.equal(h.records.managedBotLicenses.length,1);
  assert.equal(h.records.managedBotOrders[0].licenseId,'mbl_'+orderId);
});
test('a charge ID collision for another order never grants a license',async()=>{
  const h=await fixture({existingPayment:true});
  h.records.managedBotPayments[0].orderId='mbo_another';
  await assert.rejects(h.billing.handleManagedBotSuccessfulPayment(message),/charge_collision/);
  assert.equal(h.records.managedBotLicenses.length,0);
});
