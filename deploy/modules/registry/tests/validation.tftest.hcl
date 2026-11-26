mock_provider "google" {}

variables {
  location      = "europe-west1"
  repository_id = "ras"
}

run "keeps_the_two_newest_images_by_default" {
  command = plan

  assert {
    condition     = one([for policy in google_artifact_registry_repository.this.cleanup_policies : policy.most_recent_versions[0].keep_count if policy.action == "KEEP"]) == 2
    error_message = "The registry keeps the two newest images."
  }
}

run "rejects_keeping_no_image" {
  command = plan

  variables {
    keep_count = 0
  }

  expect_failures = [var.keep_count]
}

run "rejects_an_uppercase_repository_id" {
  command = plan

  variables {
    repository_id = "Ras"
  }

  expect_failures = [var.repository_id]
}
