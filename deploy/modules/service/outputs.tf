output "name" {
  description = "The service's name."
  value       = google_cloud_run_v2_service.this.name
}

output "uri" {
  description = "The service's run.app address."
  value       = google_cloud_run_v2_service.this.uri
}
