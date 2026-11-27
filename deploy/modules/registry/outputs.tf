output "name" {
  description = "The repository's id."
  value       = google_artifact_registry_repository.this.repository_id
}

output "location" {
  description = "The repository's region."
  value       = google_artifact_registry_repository.this.location
}

output "image" {
  description = "The path of the ras image, without a tag."
  value       = "${var.location}-docker.pkg.dev/${google_artifact_registry_repository.this.project}/${var.repository_id}/ras"
}
