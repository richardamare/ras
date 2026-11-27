output "ids" {
  description = "Each secret's id, keyed by itself."
  value       = { for id, secret in google_secret_manager_secret.this : id => secret.secret_id }
}
