mock_provider "google" {}

variables {
  region = "europe-west1"
  url    = "https://ras.example.com/backup"
}

run "calls_the_backup_route_at_three_prague_time" {
  command = plan

  assert {
    condition     = google_cloud_scheduler_job.backup.schedule == "0 3 * * *" && google_cloud_scheduler_job.backup.time_zone == "Europe/Prague"
    error_message = "The backup runs at three each night, Prague time."
  }

  assert {
    condition     = google_cloud_scheduler_job.backup.http_target[0].http_method == "POST" && google_cloud_scheduler_job.backup.http_target[0].uri == "https://ras.example.com/backup"
    error_message = "The job posts to the backup route."
  }

  assert {
    condition     = google_cloud_scheduler_job.backup.http_target[0].oidc_token[0].audience == "https://ras.example.com/backup"
    error_message = "The token's audience is the route's URL, which ras checks."
  }
}

run "rejects_a_url_over_http" {
  command = plan

  variables {
    url = "http://ras.example.com/backup"
  }

  expect_failures = [var.url]
}

run "rejects_a_url_outside_the_backup_route" {
  command = plan

  variables {
    url = "https://ras.example.com/"
  }

  expect_failures = [var.url]
}
