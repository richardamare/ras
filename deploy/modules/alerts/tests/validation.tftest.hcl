mock_provider "google" {}

variables {
  project_id      = "example-project"
  billing_account = "000000-AAAAAA-111111"
  email           = "owner@example.com"
  host            = "ras-123.europe-west1.run.app"
}

run "budgets_120_czk_a_month" {
  command = plan

  assert {
    condition     = google_billing_budget.this.amount[0].specified_amount[0].units == "120" && google_billing_budget.this.amount[0].specified_amount[0].currency_code == "CZK"
    error_message = "The budget is 120 CZK by default."
  }

  assert {
    condition     = google_billing_budget.this.budget_filter[0].calendar_period == "MONTH"
    error_message = "The budget counts one calendar month."
  }
}

run "checks_health_over_https" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.this.http_check[0].path == "/health" && google_monitoring_uptime_check_config.this.http_check[0].use_ssl
    error_message = "The uptime check calls /health over HTTPS."
  }
}

run "rejects_a_malformed_billing_account" {
  command = plan

  variables {
    billing_account = "billingAccounts/000000-AAAAAA-111111"
  }

  expect_failures = [var.billing_account]
}

run "rejects_an_email_without_a_domain" {
  command = plan

  variables {
    email = "owner"
  }

  expect_failures = [var.email]
}

run "rejects_a_host_with_a_scheme" {
  command = plan

  variables {
    host = "https://ras-123.europe-west1.run.app"
  }

  expect_failures = [var.host]
}

run "rejects_a_budget_of_nothing" {
  command = plan

  variables {
    budget = 0
  }

  expect_failures = [var.budget]
}
