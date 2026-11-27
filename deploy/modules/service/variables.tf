variable "name" {
  description = "The service's name, which its run.app address starts with."
  type        = string
}

variable "region" {
  description = "The region the service runs in."
  type        = string

  validation {
    condition     = startswith(var.region, "europe-")
    error_message = "region is a European region, where the owner's data stays."
  }
}

variable "service_account" {
  description = "The email of the service account the service runs as."
  type        = string
}

variable "image" {
  description = "The image of the first revision. The deploy workflow owns every later one."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "memory" {
  description = "The memory of an instance, which also holds the database and the memory clone."
  type        = string
  default     = "512Mi"
}

variable "env" {
  description = "The plain environment variables, by name."
  type        = map(string)

  validation {
    condition     = alltrue([for name in keys(var.env) : can(regex("^RAS_[A-Z0-9_]+$", name))])
    error_message = "Each environment variable is a ras setting, named RAS_ and capitals."
  }
}

variable "secrets" {
  description = "The environment variables read from Secret Manager, as the id of the secret each one holds."
  type        = map(string)

  validation {
    condition     = alltrue([for name in keys(var.secrets) : can(regex("^RAS_[A-Z0-9_]+$", name))])
    error_message = "Each secret environment variable is a ras setting, named RAS_ and capitals."
  }

  validation {
    condition     = length(setintersection(keys(var.secrets), keys(var.env))) == 0
    error_message = "A variable is either plain or a secret, never both."
  }
}
