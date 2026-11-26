terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }
}

variable "project_id" {
  description = "The project that holds the uptime check."
  type        = string
}

variable "billing_account" {
  description = "The id of the billing account the budget watches."
  type        = string

  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account))
    error_message = "billing_account is the bare id, such as 000000-AAAAAA-111111."
  }
}

variable "budget" {
  description = "The month's amount, in the billing account's currency, past which the owner gets an email."
  type        = number
  default     = 120

  validation {
    condition     = var.budget > 0 && floor(var.budget) == var.budget
    error_message = "budget is a whole amount above zero."
  }
}

variable "currency" {
  description = "The billing account's currency."
  type        = string
  default     = "CZK"
}

variable "email" {
  description = "The address the alerts go to."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.email))
    error_message = "email is an address, such as owner@example.com."
  }
}

variable "host" {
  description = "The host the uptime check calls, without a scheme."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9.-]+$", var.host))
    error_message = "host is a bare host name, such as ras-123.europe-west1.run.app."
  }
}

resource "google_monitoring_notification_channel" "this" {
  display_name = "ras owner"
  type         = "email"
  labels = {
    email_address = var.email
  }
}

resource "google_billing_budget" "this" {
  billing_account = var.billing_account
  display_name    = "ras monthly"

  budget_filter {
    calendar_period = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = var.currency
      units         = tostring(var.budget)
    }
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    monitoring_notification_channels = [google_monitoring_notification_channel.this.id]
  }
}

resource "google_monitoring_uptime_check_config" "this" {
  display_name = "ras /health"
  period       = "900s"
  timeout      = "10s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.host
    }
  }
}

resource "google_monitoring_alert_policy" "this" {
  display_name          = "ras /health stops answering"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.this.id]

  conditions {
    display_name = "More than one region fails the uptime check"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.this.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "0s"

      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }

      trigger {
        count = 1
      }
    }
  }
}
