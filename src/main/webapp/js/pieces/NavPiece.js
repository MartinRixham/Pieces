define(["./Library", "./Route"], function NavPiece(Library, Route) {

	function NavPiece(pages) {

		var self = this;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var router;

		this.currentPage = null;

		this.onBind = function(element) {

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			var route = Route.get();

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var page = document.createElement("DIV");
			page.dataset.bind = "currentPage";

			element.appendChild(page);

			router =
				route.addRoute({

					set: function(word, routeIndex, callback) {

						routePage(word, callback);
						route.update(routeIndex);
					},
					get: function(nonBlank) {

						if (nonBlank && currentIndex < 0) {

							return pages[0].route;
						}
						else if (pages[currentIndex]) {

							return pages[currentIndex].route;
						}
						else {

							return "";
						}
					}
				});
		};

		function routePage(hash, callback) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					currentIndex = i;
					activeIndex(i);

					setPage(i, callback);

					return;
				}
			}

			currentIndex = -1;
			activeIndex(-1);

			setPage(0, callback);
		}

		function setPage(index, callback) {

			if (self.currentPage == pages[index].page) {

				return;
			}

			callback();
			self.currentPage = pages[index].page;
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			var oldIndex = Math.max(currentIndex, 0);

			currentIndex = index;
			activeIndex(index);

			if (oldIndex != index) {

				router.changePage();
			}

			router.update();

			this.currentPage = pages[index].page;
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return NavPiece;
});
