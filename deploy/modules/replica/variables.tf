variable "name" {
  description = "The bucket's globally unique name."
  type        = string
}

variable "location" {
  description = "The region the bucket lives in."
  type        = string
}

variable "writer" {
  description = "The service account member that restores and replicates the database."
  type        = string

  validation {
    condition     = startswith(var.writer, "serviceAccount:")
    error_message = "writer is a service account member, such as serviceAccount:ras@project.iam.gserviceaccount.com."
  }
}

variable "soft_delete_days" {
  description = "How long a deleted object can still be restored."
  type        = number
  default     = 7

  validation {
    condition     = var.soft_delete_days >= 7 && var.soft_delete_days <= 90
    error_message = "soft_delete_days is between 7 and 90, the range Cloud Storage accepts."
  }
}
