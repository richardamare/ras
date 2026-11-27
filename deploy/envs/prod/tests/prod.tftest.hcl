mock_provider "google" {}

variables {
  project_id       = "example-project"
  graph_client_id  = "graph-client"
  google_client_id = "google-client"
  domain           = "ras.example.com"
  billing_account  = "000000-AAAAAA-111111"
  alert_email      = "owner@example.com"
  mail_username    = "owner@example.com"
  r2_endpoint      = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"
  r2_bucket        = "ras-backups"
}

run "serves_on_the_domain" {
  command = plan

  assert {
    condition     = local.url == "https://ras.example.com"
    error_message = "ras knows itself by the domain, so sign-in and OAuth redirects stay on it."
  }

  assert {
    condition     = google_cloud_run_domain_mapping.this.name == "ras.example.com"
    error_message = "The domain mapping routes the domain to the service."
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
    condition     = local.backup_url == "https://ras.example.com/backup"
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

run "rejects_a_domain_with_a_scheme" {
  command = plan

  variables {
    domain = "https://ras.example.com"
  }

  expect_failures = [var.domain]
}
