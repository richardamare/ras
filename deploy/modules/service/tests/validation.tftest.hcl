mock_provider "google" {}

variables {
  name            = "ras"
  region          = "europe-west1"
  service_account = "runtime@example.iam.gserviceaccount.com"
  env             = { RAS_URL = "https://ras.example.run.app" }
  secrets         = { RAS_AUTH_SECRET = "auth-secret" }
}

run "runs_at_most_one_instance_and_none_while_idle" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].scaling[0].max_instance_count == 1
    error_message = "The service runs at most one instance, the only writer of the database."
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].scaling[0].min_instance_count == 0
    error_message = "The service runs no instance while idle."
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].resources[0].cpu_idle
    error_message = "The service is billed by request."
  }
}

run "rejects_an_environment_name_outside_ras" {
  command = plan

  variables {
    env = { PORT = "8080" }
  }

  expect_failures = [var.env]
}

run "rejects_a_secret_that_is_also_a_plain_variable" {
  command = plan

  variables {
    env     = { RAS_AUTH_SECRET = "plain" }
    secrets = { RAS_AUTH_SECRET = "auth-secret" }
  }

  expect_failures = [var.secrets]
}

run "rejects_a_region_outside_europe" {
  command = plan

  variables {
    region = "us-central1"
  }

  expect_failures = [var.region]
}
