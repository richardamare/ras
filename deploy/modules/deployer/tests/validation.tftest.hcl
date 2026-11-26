mock_provider "google" {}

variables {
  project_id      = "example-project"
  repository      = "owner/ras"
  registry        = { name = "ras", location = "europe-west1" }
  runtime_account = "projects/example-project/serviceAccounts/runtime@example-project.iam.gserviceaccount.com"
}

run "trusts_only_version_tags_of_the_repository" {
  command = plan

  assert {
    condition     = google_iam_workload_identity_pool_provider.this.attribute_condition == "assertion.repository == 'owner/ras' && assertion.ref.startsWith('refs/tags/v')"
    error_message = "Only a v* tag of the repository gets a Google token."
  }
}

run "rejects_a_repository_without_its_owner" {
  command = plan

  variables {
    repository = "ras"
  }

  expect_failures = [var.repository]
}
