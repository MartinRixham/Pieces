define(["./Library", "./Route"], function NavPiece(Library, Route) {

	function NavPiece(pages) {

		var self = this;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var router;

		this.datumPiecesCurrentPage = null;

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
			page.dataset.bind = "datumPiecesCurrentPage";

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

			if (!self.datumPiecesCurrentPage) {

				setPage(0, callback);
			}
		}

		function setPage(index, callback) {

			var page = pages[index].page;

			if (typeof page == "function") {
				page = page();
				pages[index].page = page;
			}

			if (self.datumPiecesCurrentPage == page) {

				return;
			}

			callback();
			self.datumPiecesCurrentPage = page;
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			var page = pages[index].page;

			if (typeof page == "function") {
				page = page();
				pages[index].page = page;
			}

			var oldIndex = Math.max(currentIndex, 0);

			currentIndex = index;
			activeIndex(index);

			if (oldIndex != index) {

				router.changePage();
			}

			router.update();

			this.datumPiecesCurrentPage = page;
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return NavPiece;
});
