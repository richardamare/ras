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
