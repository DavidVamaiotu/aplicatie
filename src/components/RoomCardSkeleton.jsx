import React from 'react';

const RoomCardSkeleton = () => {
    return (
        <div className="flex flex-col gap-2 bg-white shadow-md rounded-2xl animate-pulse">
            {/* Image Placeholder */}
            <div className="relative aspect-4-3 w-full overflow-hidden rounded-2xl bg-gray-200 skeleton-shimmer"></div>

            {/* Content Placeholder */}
            <div className="flex flex-col gap-2 m-3">
                <div className="flex justify-between items-start">
                    <div className="h-5 bg-gray-200 rounded w-3/4 skeleton-shimmer"></div>
                    <div className="h-4 bg-gray-200 rounded w-12 skeleton-shimmer"></div>
                </div>

                <div className="h-4 bg-gray-200 rounded w-full skeleton-shimmer"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3 skeleton-shimmer"></div>

                <div className="flex items-baseline gap-1 mt-1">
                    <div className="h-6 bg-gray-200 rounded w-20 skeleton-shimmer"></div>
                    <div className="h-4 bg-gray-200 rounded w-16 skeleton-shimmer"></div>
                </div>
            </div>
        </div>
    );
};

export default RoomCardSkeleton;
