variable "project_id" {
  description = "The Google Cloud project ras runs in."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id is the project's id, such as ras-123456."
  }
}

variable "region" {
  description = "The region every regional resource lives in."
  type        = string
}

variable "github_repository" {
  description = "The GitHub repository whose v* tags deploy, as owner/name."
  type        = string
}

variable "memory_repository" {
  description = "The SSH address of the memory repository the service clones at start."
  type        = string

  validation {
    condition     = can(regex("^git@github\\.com:[^/]+/[^/]+\\.git$", var.memory_repository))
    error_message = "memory_repository is an SSH address, such as git@github.com:octocat/memory.git."
  }
}

variable "graph_client_id" {
  description = "The id of the Entra app ras signs in to Outlook with."
  type        = string

  validation {
    condition     = length(var.graph_client_id) > 0
    error_message = "graph_client_id is the Entra app's client id."
  }
}

variable "google_client_id" {
  description = "The id of the Google OAuth client ras signs in to Google with."
  type        = string

  validation {
    condition     = length(var.google_client_id) > 0
    error_message = "google_client_id is the Google OAuth client's id."
  }
}

variable "domain" {
  description = "The host name ras serves on, which Cloudflare points at the domain mapping. Private."
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", var.domain))
    error_message = "domain is a bare host name, such as ras.example.com."
  }
}

variable "billing_account" {
  description = "The id of the billing account the budget watches. Private."
  type        = string
}

variable "alert_email" {
  description = "The address the budget and uptime alerts go to. Private."
  type        = string
}

variable "mail_username" {
  description = "The username of the mailbox ras reads. Private."
  type        = string
}

variable "r2_endpoint" {
  description = "The S3 endpoint of the Cloudflare account holding the backup bucket. Private."
  type        = string

  validation {
    condition     = can(regex("^https://[0-9a-f]{32}(\\.[a-z]+)?\\.r2\\.cloudflarestorage\\.com$", var.r2_endpoint))
    error_message = "r2_endpoint is the account's R2 endpoint, such as https://<account id>.r2.cloudflarestorage.com."
  }
}

variable "r2_bucket" {
  description = "The R2 bucket the nightly backups land in. Private."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.r2_bucket))
    error_message = "r2_bucket is an R2 bucket name: lowercase letters, digits and hyphens."
  }
}
