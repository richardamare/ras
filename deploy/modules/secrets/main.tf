# The secrets have no versions here: the seed script adds the values, so Terraform's state never holds one.

resource "google_secret_manager_secret" "this" {
  for_each  = var.secret_ids
  secret_id = each.value

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each  = google_secret_manager_secret.this
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = var.accessor
}
