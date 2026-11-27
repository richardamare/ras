variable "region" {
  description = "The region the job runs in."
  type        = string
}

variable "url" {
  description = "The URL of ras's backup route, which is also the audience ras expects in the job's token."
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+/backup$", var.url))
    error_message = "url is ras's backup route over HTTPS, such as https://ras.example.com/backup."
  }
}
