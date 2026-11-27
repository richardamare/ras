variable "project_id" {
  description = "The project the deploy workflow rolls the service in."
  type        = string
}

variable "repository" {
  description = "The GitHub repository whose v* tags deploy, as owner/name."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", var.repository))
    error_message = "repository is owner/name, such as octocat/ras."
  }
}

variable "registry" {
  description = "The Artifact Registry repository the workflow pushes images to."
  type = object({
    name     = string
    location = string
  })
}

variable "runtime_account" {
  description = "The id of the service account the service runs as, which a deploy acts as."
  type        = string
}
