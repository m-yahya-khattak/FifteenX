"use client";

import { useState } from "react";

const comments = [
  {
    id: 1,
    username: "amandeep336",
    time: "3h ago",
    text: "hi",
    likes: 1,
    avatar: "AG",
  },
  {
    id: 2,
    username: "amandeep336",
    time: "3h ago",
    text: "dness",
    likes: 0,
    avatar: "AG",
  },
  {
    id: 3,
    username: "cs2maxi",
    time: "4h ago",
    text: "sadness.",
    likes: 0,
    avatar: "CM",
  },
];

export default function CommentsSection() {
  const [activeTab, setActiveTab] = useState<"comments" | "holders" | "activity">("comments");

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      {/* Tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto border-b border-zinc-800 scrollbar-hide sm:gap-4">
        <button
          onClick={() => setActiveTab("comments")}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
            activeTab === "comments"
              ? "border-blue-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Comments (7,298)
        </button>
        <button
          onClick={() => setActiveTab("holders")}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
            activeTab === "holders"
              ? "border-blue-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Top Holders
        </button>
        <button
          onClick={() => setActiveTab("activity")}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
            activeTab === "activity"
              ? "border-blue-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Activity
        </button>
      </div>

      {/* Comment Input */}
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add a comment"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-800 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-700 focus:outline-none"
          />
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Post
          </button>
        </div>
        <div className="mt-2 flex items-center gap-4">
          <select className="rounded-lg border border-zinc-800 bg-zinc-800 px-3 py-1 text-xs text-white focus:border-zinc-700 focus:outline-none">
            <option>Newest</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" className="rounded" />
            Holders
          </label>
        </div>
      </div>

      {/* Warning */}
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2">
        <svg
          className="h-4 w-4 text-yellow-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-xs text-yellow-500">Beware of external links.</span>
      </div>

      {/* Comments List */}
      <div className="space-y-4">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-green-400 via-yellow-400 to-orange-400 text-xs font-bold text-white">
              {comment.avatar}
            </div>
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {comment.username}
                </span>
                <span className="text-xs text-zinc-400">{comment.time}</span>
              </div>
              <p className="mb-2 text-sm text-zinc-300">{comment.text}</p>
              <div className="flex items-center gap-4">
                <button className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                  {comment.likes}
                </button>
                <button className="text-xs text-zinc-400 hover:text-white">
                  Reply
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Back to top */}
      <div className="mt-6 text-center">
        <button className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
          Back to top
        </button>
      </div>
    </div>
  );
}

