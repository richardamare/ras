resource "google_storage_bucket" "this" {
  name                        = var.name
  location                    = var.location
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  soft_delete_policy {
    retention_duration_seconds = var.soft_delete_days * 86400
  }
}

resource "google_storage_bucket_iam_member" "writer" {
  bucket = google_storage_bucket.this.name
  role   = "roles/storage.objectAdmin"
  member = var.writer
}
