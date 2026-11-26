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
