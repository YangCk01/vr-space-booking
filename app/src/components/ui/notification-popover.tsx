"use client";

import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Notification = {
  id: string;
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  source?: string;
  type?: string;
};

interface NotificationItemProps {
  notification: Notification;
  index: number;
  onMarkAsRead: (id: string) => void;
  textColor?: string;
  hoverBgColor?: string;
  dotColor?: string;
}

const sourceLabelMap: Record<string, string> = {
  USER: '用户',
  SYSTEM: '系统',
  ADMIN: '管理员',
}

const typeLabelMap: Record<string, string> = {
  ADMIN_NEW_ORDER: '新订单',
  ADMIN_GROUP_BUY_PURCHASED: '团购购买',
  ADMIN_GROUP_BUY_BOOKED: '团购预约',
  ADMIN_ORDER_CANCELLED: '订单取消',
  ADMIN_REFUND_REQUEST: '退款',
  BOOKING_CANCEL: '取消',
  BOOKING_SUCCESS: '预约',
  PAY_SUCCESS: '支付',
  ORDER_COMPLETED: '核销',
}

const typeToneMap: Record<string, string> = {
  ADMIN_NEW_ORDER: 'bg-emerald-100 text-emerald-700',
  ADMIN_GROUP_BUY_PURCHASED: 'bg-violet-100 text-violet-700',
  ADMIN_GROUP_BUY_BOOKED: 'bg-sky-100 text-sky-700',
  ADMIN_ORDER_CANCELLED: 'bg-rose-100 text-rose-700',
  ADMIN_REFUND_REQUEST: 'bg-orange-100 text-orange-700',
  BOOKING_CANCEL: 'bg-rose-100 text-rose-700',
  BOOKING_SUCCESS: 'bg-sky-100 text-sky-700',
  PAY_SUCCESS: 'bg-emerald-100 text-emerald-700',
  ORDER_COMPLETED: 'bg-indigo-100 text-indigo-700',
}

const NotificationItem = ({
  notification,
  index,
  onMarkAsRead,
  textColor = "text-white",
  dotColor = "bg-white",
  hoverBgColor = "hover:bg-[#ffffff37]",
}: NotificationItemProps) => {
  const sourceLabel = notification.source ? (sourceLabelMap[notification.source] || notification.source) : null
  const typeLabel = notification.type ? (typeLabelMap[notification.type] || notification.type) : sourceLabel
  const typeTone = notification.type ? typeToneMap[notification.type] : undefined
  return (
    <motion.div
      initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      key={notification.id}
      className={cn(`p-4 ${hoverBgColor} cursor-pointer transition-colors`)}
      onClick={() => onMarkAsRead(notification.id)}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2 min-w-0">
          {!notification.read && (
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          )}
          {typeLabel && (
            <span className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
              typeTone ||
              (notification.source === 'USER' ? 'bg-blue-100 text-blue-700' :
              notification.source === 'ADMIN' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-600'
              )
            )}>
              {typeLabel}
            </span>
          )}
          <h4 className={cn('text-sm font-medium truncate', textColor)}>
            {notification.title}
          </h4>
        </div>

        <span className={cn('text-xs opacity-80 shrink-0 ml-2', textColor)}>
          {notification.timestamp.toLocaleDateString()}
        </span>
      </div>
      <p className={cn('text-xs opacity-70 mt-1', textColor)}>
        {notification.description}
      </p>
    </motion.div>
  )
};

interface NotificationListProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  textColor?: string;
  hoverBgColor?: string;
  dividerColor?: string;
  emptyText?: string;
}

const NotificationList = ({
  notifications,
  onMarkAsRead,
  textColor,
  hoverBgColor,
  dividerColor = "divide-gray-200/40",
  emptyText = "No notifications",
}: NotificationListProps) => (
  <div className={cn("divide-y", dividerColor)}>
    {notifications.length === 0 ? (
      <div className={cn("px-4 py-8 text-center text-xs opacity-60", textColor)}>
        {emptyText}
      </div>
    ) : (
      notifications.map((notification, index) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          index={index}
          onMarkAsRead={onMarkAsRead}
          textColor={textColor}
          hoverBgColor={hoverBgColor}
        />
      ))
    )}
  </div>
);

interface NotificationPopoverProps {
  notifications?: Notification[];
  onNotificationsChange?: (notifications: Notification[]) => void;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onClearAll?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  emptyText?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  textColor?: string;
  hoverBgColor?: string;
  dividerColor?: string;
  headerBorderColor?: string;
}

export const NotificationPopover = ({
  notifications: initialNotifications = dummyNotifications,
  onNotificationsChange,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  open: controlledOpen,
  onOpenChange,
  title = "Notifications",
  emptyText = "No notifications",
  buttonClassName = "w-10 h-10 rounded-xl bg-[#11111198] hover:bg-[#111111d1] shadow-[0_0_20px_rgba(0,0,0,0.2)]",
  popoverClassName = "bg-[#11111198] backdrop-blur-sm",
  textColor = "text-white",
  hoverBgColor = "hover:bg-[#ffffff37]",
  dividerColor = "divide-gray-200/40",
  headerBorderColor = "border-gray-200/50",
}: NotificationPopoverProps) => {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);

  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  const setOpen = (value: boolean) => {
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  };

  const toggleOpen = () => setOpen(!isOpen);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const updateNotifications = (updated: Notification[]) => {
    setNotifications(updated);
    onNotificationsChange?.(updated);
  };

  const markAllAsRead = () => {
    const updatedNotifications = notifications.map((n) => ({
      ...n,
      read: true,
    }));
    updateNotifications(updatedNotifications);
    onMarkAllAsRead?.();
  };

  const markAsRead = (id: string) => {
    const updatedNotifications = notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    updateNotifications(updatedNotifications);
    onMarkAsRead?.(id);
  };

  return (
    <div className={cn("relative", textColor)}>
      <Button
        onClick={toggleOpen}
        variant="ghost"
        size="icon"
        className={cn("relative", buttonClassName)}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-black rounded-full flex items-center justify-center text-xs border border-gray-800 text-white">
            {unreadCount}
          </div>
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute right-0 mt-2 w-80 max-h-[400px] overflow-y-auto rounded-xl shadow-lg z-50",
              popoverClassName
            )}
          >
            <div
              className={cn(
                "p-4 border-b flex justify-between items-center",
                headerBorderColor
              )}
            >
              <h3 className={cn("text-sm font-medium", textColor)}>{title}</h3>
              <div className="flex items-center gap-2">
                <Button
                  onClick={markAllAsRead}
                  variant="ghost"
                  size="sm"
                  className={cn("text-xs hover:text-white", hoverBgColor)}
                >
                  全部已读
                </Button>
                {notifications.length > 0 && onClearAll && (
                  <Button
                    onClick={onClearAll}
                    variant="ghost"
                    size="sm"
                    className={cn("text-xs text-red-400 hover:text-red-300", hoverBgColor)}
                  >
                    清除
                  </Button>
                )}
              </div>
            </div>

            <NotificationList
              notifications={notifications}
              onMarkAsRead={markAsRead}
              textColor={textColor}
              hoverBgColor={hoverBgColor}
              dividerColor={dividerColor}
              emptyText={emptyText}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const dummyNotifications: Notification[] = [
  {
    id: "1",
    title: "New Message",
    description: "You have received a new message from John Doe",
    timestamp: new Date(),
    read: false,
  },
  {
    id: "2",
    title: "System Update",
    description: "System maintenance scheduled for tomorrow",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    read: false,
  },
  {
    id: "3",
    title: "Reminder",
    description: "Meeting with team at 2 PM",
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    read: true,
  },
];
