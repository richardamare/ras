mock_provider "google" {}

variables {
  name     = "example-ras-replica"
  location = "europe-west1"
  writer   = "serviceAccount:runtime@example.iam.gserviceaccount.com"
}

run "keeps_versions_and_soft_deleted_objects" {
  command = plan

  assert {
    condition     = google_storage_bucket.this.versioning[0].enabled
    error_message = "The replica bucket keeps object versions."
  }

  assert {
    condition     = google_storage_bucket.this.soft_delete_policy[0].retention_duration_seconds == 7 * 86400
    error_message = "The replica bucket keeps soft-deleted objects for seven days by default."
  }
}

run "rejects_a_soft_delete_shorter_than_a_week" {
  command = plan

  variables {
    soft_delete_days = 3
  }

  expect_failures = [var.soft_delete_days]
}

run "rejects_a_soft_delete_longer_than_ninety_days" {
  command = plan

  variables {
    soft_delete_days = 91
  }

  expect_failures = [var.soft_delete_days]
}

run "rejects_a_writer_that_is_not_a_service_account" {
  command = plan

  variables {
    writer = "allUsers"
  }

  expect_failures = [var.writer]
}
