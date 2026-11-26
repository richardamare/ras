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
  r2_endpoint      = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"
  r2_bucket        = "ras-backups"
}

run "serves_on_its_own_run_app_address" {
  command = plan

  assert {
    condition     = local.host == "ras-123456789.europe-west1.run.app"
    error_message = "The service and the uptime check use the service's run.app address."
  }
}

run "holds_every_secret_the_service_reads" {
  command = plan

  assert {
    condition     = length(module.secrets.ids) == 9
    error_message = "Secret Manager holds the nine secrets this service reads, the two R2 keys included."
  }
}

run "backs_up_through_the_route_on_the_address_ras_knows_itself_by" {
  command = plan

  assert {
    condition     = local.backup_url == "https://ras-123456789.europe-west1.run.app/backup"
    error_message = "The job calls /backup on RAS_URL, so its token's audience is the one ras expects."
  }
}

run "rejects_an_r2_endpoint_outside_cloudflare" {
  command = plan

  variables {
    r2_endpoint = "https://s3.example.com"
  }

  expect_failures = [var.r2_endpoint]
}

run "rejects_an_r2_bucket_with_uppercase_letters" {
  command = plan

  variables {
    r2_bucket = "Ras-Backups"
  }

  expect_failures = [var.r2_bucket]
}

run "rejects_a_memory_repository_over_https" {
  command = plan

  variables {
    memory_repository = "https://github.com/octocat/memory.git"
  }

  expect_failures = [var.memory_repository]
}
