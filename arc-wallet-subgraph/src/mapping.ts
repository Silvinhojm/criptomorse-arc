import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  JobCreated,
  JobFunded,
  JobSubmitted,
  JobCompleted,
  JobRejected,
} from "../generated/AgenticCommerce/AgenticCommerce";
import { Job, JobActivity, GlobalStats } from "../generated/schema";

const ZERO = BigInt.fromI32(0);

function getOrCreateStats(): GlobalStats {
  let stats = GlobalStats.load("global");
  if (!stats) {
    stats = new GlobalStats("global");
    stats.totalJobs      = ZERO;
    stats.totalFunded    = ZERO;
    stats.totalCompleted = ZERO;
    stats.totalRejected  = ZERO;
  }
  return stats;
}

export function handleJobCreated(event: JobCreated): void {
  const id  = event.params.jobId.toString();
  let job   = new Job(id);

  job.client      = event.params.client;
  job.provider    = event.params.provider;
  job.evaluator   = event.params.evaluator;
  job.description = "";           // fetched via contract call if needed
  job.budget      = ZERO;
  job.expiredAt   = event.params.expiredAt;
  job.status      = "Open";
  job.hook        = event.params.hook;
  job.createdAt   = event.block.timestamp;
  job.createdTx   = event.transaction.hash;
  job.updatedAt   = event.block.timestamp;
  job.save();

  // Activity log
  const actId   = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let activity  = new JobActivity(actId);
  activity.job       = id;
  activity.action    = "Created";
  activity.actor     = event.params.client;
  activity.timestamp = event.block.timestamp;
  activity.txHash    = event.transaction.hash;
  activity.save();

  // Stats
  const stats    = getOrCreateStats();
  stats.totalJobs = stats.totalJobs.plus(BigInt.fromI32(1));
  stats.save();
}

export function handleJobFunded(event: JobFunded): void {
  const id  = event.params.jobId.toString();
  let job   = Job.load(id);
  if (!job) return;

  job.status    = "Funded";
  job.budget    = event.params.amount;
  job.updatedAt = event.block.timestamp;
  job.save();

  const actId  = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let activity = new JobActivity(actId);
  activity.job       = id;
  activity.action    = "Funded";
  activity.actor     = event.params.client;
  activity.timestamp = event.block.timestamp;
  activity.txHash    = event.transaction.hash;
  activity.save();

  const stats       = getOrCreateStats();
  stats.totalFunded = stats.totalFunded.plus(event.params.amount);
  stats.save();
}

export function handleJobSubmitted(event: JobSubmitted): void {
  const id  = event.params.jobId.toString();
  let job   = Job.load(id);
  if (!job) return;

  job.status    = "Submitted";
  job.updatedAt = event.block.timestamp;
  job.save();

  const actId  = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let activity = new JobActivity(actId);
  activity.job         = id;
  activity.action      = "Submitted";
  activity.actor       = event.params.provider;
  activity.deliverable = event.params.deliverable;
  activity.timestamp   = event.block.timestamp;
  activity.txHash      = event.transaction.hash;
  activity.save();
}

export function handleJobCompleted(event: JobCompleted): void {
  const id  = event.params.jobId.toString();
  let job   = Job.load(id);
  if (!job) return;

  job.status    = "Completed";
  job.updatedAt = event.block.timestamp;
  job.save();

  const actId  = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let activity = new JobActivity(actId);
  activity.job       = id;
  activity.action    = "Completed";
  activity.actor     = event.params.evaluator;
  activity.reason    = event.params.reason;
  activity.timestamp = event.block.timestamp;
  activity.txHash    = event.transaction.hash;
  activity.save();

  const stats           = getOrCreateStats();
  stats.totalCompleted  = stats.totalCompleted.plus(BigInt.fromI32(1));
  stats.save();
}

export function handleJobRejected(event: JobRejected): void {
  const id  = event.params.jobId.toString();
  let job   = Job.load(id);
  if (!job) return;

  job.status    = "Rejected";
  job.updatedAt = event.block.timestamp;
  job.save();

  const actId  = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let activity = new JobActivity(actId);
  activity.job       = id;
  activity.action    = "Rejected";
  activity.actor     = event.params.evaluator;
  activity.reason    = event.params.reason;
  activity.timestamp = event.block.timestamp;
  activity.txHash    = event.transaction.hash;
  activity.save();

  const stats          = getOrCreateStats();
  stats.totalRejected  = stats.totalRejected.plus(BigInt.fromI32(1));
  stats.save();
}
