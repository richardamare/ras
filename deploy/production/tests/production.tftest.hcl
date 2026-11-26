mock_provider "google" {
  mock_data "google_project" {
    defaults = {
      number = "123456789"
    }
  }
}

variables {
  project_id       = "example-project"
  graph_client_id  = "graph-client"
  google_client_id = "google-client"
  billing_account  = "000000-AAAAAA-111111"
  alert_email      = "owner@example.com"
  mail_username    = "owner@example.com"
}

run "serves_on_its_own_run_app_address" {
  command = plan

  assert {
    condition     = local.host == "ras-123456789.europe-west1.run.app"
    error_message = "The service and the uptime check use the service's run.app address."
  }
}

run "holds_every_secret_but_the_backups" {
  command = plan

  assert {
    condition     = length(module.secrets.ids) == 7
    error_message = "Secret Manager holds the seven secrets this service reads."
  }
}

run "rejects_a_memory_repository_over_https" {
  command = plan

  variables {
    memory_repository = "https://github.com/octocat/memory.git"
  }

  expect_failures = [var.memory_repository]
}
