"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    className={cn("flex w-full min-w-0 flex-col gap-1", className)}
    {...props}
  />
))
SidebarMenu.displayName = "SidebarMenu"

export const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn("relative", className)}
    {...props}
  />
))
SidebarMenuItem.displayName = "SidebarMenuItem"

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    isActive?: boolean;
  }
>(({ className, isActive, ...props }, ref) => (
  <button
    ref={ref}
    data-sidebar="menu-button"
    data-active={isActive}
    className={cn(
      "flex w-full items-center gap-2 rounded-md p-2 text-left text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground",
      className
    )}
    {...props}
  />
))
SidebarMenuButton.displayName = "SidebarMenuButton"

// Stub components for compatibility
export const SidebarMenuAction = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
  (props, ref) => <button ref={ref} {...props} />
)
SidebarMenuAction.displayName = "SidebarMenuAction"

export const SidebarMenuBadge = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  (props, ref) => <div ref={ref} {...props} />
)
SidebarMenuBadge.displayName = "SidebarMenuBadge"

export const SidebarMenuSkeleton = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  (props, ref) => <div ref={ref} {...props} />
)
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton"

export const SidebarMenuSub = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  (props, ref) => <ul ref={ref} {...props} />
)
SidebarMenuSub.displayName = "SidebarMenuSub"

export const SidebarMenuSubItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(
  (props, ref) => <li ref={ref} {...props} />
)
SidebarMenuSubItem.displayName = "SidebarMenuSubItem"

export const SidebarMenuSubButton = React.forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>(
  (props, ref) => <a ref={ref} {...props} />
)
SidebarMenuSubButton.displayName = "SidebarMenuSubButton" 