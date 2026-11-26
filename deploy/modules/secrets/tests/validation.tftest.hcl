mock_provider "google" {}

variables {
  secret_ids = ["auth-secret", "memory-deploy-key"]
  accessor   = "serviceAccount:runtime@example.iam.gserviceaccount.com"
}

run "creates_each_secret_without_a_version" {
  command = plan

  assert {
    condition     = length(google_secret_manager_secret.this) == 2
    error_message = "Each secret id gets one secret."
  }

  assert {
    condition     = length(google_secret_manager_secret_iam_member.accessor) == 2
    error_message = "The accessor reads each secret."
  }
}

run "rejects_a_secret_id_with_a_dot" {
  command = plan

  variables {
    secret_ids = ["auth.secret"]
  }

  expect_failures = [var.secret_ids]
}

run "rejects_an_accessor_that_is_not_a_service_account" {
  command = plan

  variables {
    accessor = "allAuthenticatedUsers"
  }

  expect_failures = [var.accessor]
}
