output "url" {
  description = "The service's run.app address."
  value       = module.service.uri
}

output "image" {
  description = "The path the deploy workflow pushes the ras image to."
  value       = module.registry.image
}

output "workload_identity_provider" {
  description = "The GitHub variable GCP_WORKLOAD_IDENTITY_PROVIDER."
  value       = module.deployer.workload_identity_provider
}

output "deploy_service_account" {
  description = "The GitHub variable GCP_DEPLOY_SERVICE_ACCOUNT."
  value       = module.deployer.service_account
}

output "replica_bucket" {
  description = "The bucket holding the replica, which the move seeds."
  value       = module.replica.name
}

output "backup_job" {
  description = "The Scheduler job that backs the database up to R2 each night."
  value       = module.scheduler.job
}
